"""Fieldwork API acceptance tests: only temporary databases, real session auth."""

import io
import json
import os
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
from unittest.mock import Mock, patch
from uuid import UUID, uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image, PngImagePlugin

from app.fieldwork import MAX_PHOTO_BYTES, MAX_REPORT_BYTES, install_fieldwork_routes
from app.main import create_app
from app.security import COOKIE_NAME


ORIGIN = {"Origin": "http://localhost:5173"}
PASSWORD = "fieldwork-password-123"
PDF = b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n"
INPUTS = {
    "sensor": {"moisture_pct": 62, "ph": 4.2, "temperature_c": 24, "humidity_pct": 68},
    "nir": {"protein_pct": 8.8, "dry_matter_pct": 38, "fiber_pct": 28},
    "vision": {"mold_score": 0.08, "color_anomaly": 0.05, "surface_damage": 0.02},
}


def image_bytes(format="PNG", metadata=False):
    output = io.BytesIO()
    image = Image.new("RGB", (24, 16), "green")
    options = {}
    if metadata:
        exif = Image.Exif()
        exif[270] = "private farm location"
        options["exif"] = exif
        if format == "PNG":
            info = PngImagePlugin.PngInfo()
            info.add_text("private", "location and device")
            options["pnginfo"] = info
    image.save(output, format, **options)
    return output.getvalue()


def resource_body(collection, **changes):
    if collection == "reminders":
        return {"title": "Inspect cover", **changes}
    return {"batch_id": "LOT-01", "sample_type": "silage", **changes}


class FieldworkTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.database = Path(self.temp.name) / "fieldwork.sqlite3"
        environment = patch.dict(os.environ, {"NUTRI_SCAN_ORIGINS": "", "NUTRI_SCAN_COOKIE_SECURE": "false"})
        environment.start()
        self.addCleanup(environment.stop)
        self.app = create_app(self.database)
        self.assertIn(
            "/api/v1/batches", {route.path for route in self.app.routes},
            "create_app must call install_fieldwork_routes before returning",
        )
        self.client = self.new_client()
        self.account = self.register(self.client, "owner")

    def new_client(self, app=None):
        client = TestClient(app or self.app)
        self.addCleanup(client.close)
        return client

    def register(self, client, username):
        response = client.post("/api/v1/auth/register", headers=ORIGIN, json={"username": username, "password": PASSWORD, "farm_name": "Fieldwork Farm"})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def role_client(self, role):
        response = self.client.post("/api/v1/members", headers=ORIGIN, json={"username": role, "password": PASSWORD, "role": role})
        self.assertEqual(response.status_code, 201, response.text)
        client = self.new_client()
        login = client.post("/api/v1/auth/login", headers=ORIGIN, json={"username": role, "password": PASSWORD})
        self.assertEqual(login.status_code, 200, login.text)
        return client

    def create(self, collection, client=None, **changes):
        response = (client or self.client).post(f"/api/v1/{collection}", headers=ORIGIN, json=resource_body(collection, **changes))
        self.assertEqual(response.status_code, 201, response.text)
        data = response.json()
        UUID(data["id"])
        self.assertEqual(data["farm_id"], self.account["farm"]["id"])
        return data

    def upload(self, collection, resource_id, client=None, payload=None, content_type=None, **headers):
        segment = "reports" if collection == "testing-requests" else "photos"
        return (client or self.client).post(
            f"/api/v1/{collection}/{resource_id}/{segment}", content=image_bytes() if payload is None else payload,
            headers={**ORIGIN, "Content-Type": content_type or "image/png", **headers},
        )

    def status(self, collection, resource_id, client=None, **values):
        return (client or self.client).post(f"/api/v1/{collection}/{resource_id}/status", headers=ORIGIN, json=values)

    def assert_private(self, response):
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")

    def test_all_resources_and_private_bytes_survive_application_reopen(self):
        batch = self.create("batches", name="North silo", storage_location="Silo 2", prepared_on="2026-03-01", opened_on="2026-03-10", quantity=12.5, quantity_unit="tonne", notes="Farmer's notes")
        observation = self.create("observations", observed_on="2026-03-11", mould="no", unusual_heat="yes", unusual_smell="unknown", cover_damage="no", notes="Review requested")
        reminder = self.create("reminders", due_on="2026-03-12", batch_id="LOT-01", sample_type="silage")
        request = self.create("testing-requests", requested_on="2026-03-11", contact_name="Chosen contact", contact_details="Local phone", notes="Local tracking only")
        attachments = []
        for collection, parent in (("batches", batch), ("observations", observation), ("testing-requests", request)):
            response = self.upload(collection, parent["id"], payload=PDF if collection == "testing-requests" else image_bytes(), content_type="application/pdf" if collection == "testing-requests" else "image/png")
            self.assertEqual(response.status_code, 201, response.text)
            attachments.append(response.json())
        completed = self.status("reminders", reminder["id"], status="completed")
        self.assertEqual(completed.status_code, 200, completed.text)
        collected = self.status("testing-requests", request["id"], status="collected", collected_on="2026-03-12")
        self.assertEqual(collected.status_code, 200, collected.text)
        reported = self.status("testing-requests", request["id"], status="report_received", report_received_on="2026-03-15")
        self.assertEqual(reported.status_code, 200, reported.text)
        restarted = self.new_client(create_app(self.database))
        restarted.cookies.update(self.client.cookies)
        loaded = restarted.get(f"/api/v1/batches/{batch['id']}")
        self.assertEqual(loaded.status_code, 200, loaded.text)
        self.assertEqual(loaded.json()["name"], "North silo")
        self.assertEqual(loaded.json()["quantity"], 12.5)
        self.assertEqual(loaded.json()["latest_observation"]["id"], observation["id"])
        self.assertEqual(loaded.json()["photo_count"], 1)
        self.assertEqual(restarted.get(f"/api/v1/observations/{observation['id']}").json()["photo_count"], 1)
        self.assertEqual(restarted.get("/api/v1/reminders").json()["items"], [completed.json()])
        self.assertEqual(restarted.get(f"/api/v1/testing-requests/{request['id']}").json(), reported.json())
        for attachment in attachments:
            response = restarted.get(attachment["url"])
            self.assertEqual(response.status_code, 200, response.text)
            self.assert_private(response)
        self.assertEqual(restarted.get(attachments[-1]["url"]).content, PDF)

    def test_existing_saved_scan_cards_and_observations_match_exact_farm_batch_sample(self):
        scan_response = self.client.post("/api/v1/scans", headers=ORIGIN, json={"batch_id": " LOT%_01 ", "sample_type": "silage", "inputs": INPUTS})
        self.assertEqual(scan_response.status_code, 201, scan_response.text)
        saved_scan = scan_response.json()
        # Observation-only workflows and reads must never invoke the engine.
        with patch("app.main.analyze", side_effect=AssertionError("Fieldwork called the engine")), patch("app.engine.analyze", side_effect=AssertionError("Fieldwork called the engine")):
            batch = self.create("batches", batch_id=" LOT%_01 ")
            self.assertEqual(batch["latest_scan"], saved_scan)
            self.assertIsNone(batch["latest_observation"])
            self.create("observations", batch_id=" LOT%_01 ", observed_on="2026-03-20")
            latest = self.create("observations", batch_id=" LOT%_01 ", observed_on="2026-03-01")
            self.create("observations", batch_id=" LOT%_01 ", sample_type="feed")
            self.create("observations", batch_id="LOT%_01")
            other = self.new_client()
            self.register(other, "other")
            foreign = other.post("/api/v1/observations", headers=ORIGIN, json=resource_body("observations", batch_id=" LOT%_01 "))
            self.assertEqual(foreign.status_code, 201, foreign.text)
            card = self.client.get(f"/api/v1/batches/{batch['id']}").json()
            self.assertEqual(card["latest_scan"], saved_scan)
            self.assertEqual(card["latest_observation"], latest)
            for field in ("mould", "unusual_heat", "unusual_smell", "cover_damage"):
                self.assertEqual(latest[field], "unknown")
            self.assertEqual(latest["kind"], "observation_only")
            for field in ("score", "quality_score", "confidence", "risk_level", "result", "safety"):
                self.assertNotIn(field, latest)
            feed = self.create("batches", batch_id=" LOT%_01 ", sample_type="feed")
            self.assertIsNone(feed["latest_scan"])
        self.assertEqual(self.client.get("/api/v1/scans/search").json()["total"], 1)

    def test_pagination_envelopes_and_exact_observation_filters(self):
        for collection in ("batches", "observations", "reminders", "testing-requests"):
            self.assertEqual(self.client.get(f"/api/v1/{collection}").json(), {"items": [], "total": 0, "limit": 20, "offset": 0})
            for index in range(3):
                self.create(collection, **({"title": f"Task {index}"} if collection == "reminders" else {"batch_id": f"LOT-{index}"}))
            full = self.client.get(f"/api/v1/{collection}").json()
            page_response = self.client.get(f"/api/v1/{collection}", params={"limit": 1, "offset": 1})
            self.assert_private(page_response)
            page = page_response.json()
            self.assertEqual(page, {"items": full["items"][1:2], "total": 3, "limit": 1, "offset": 1})
            self.assertEqual(self.client.get(f"/api/v1/{collection}", params={"offset": 99}).json()["items"], [])
            for params in ({"limit": 0}, {"limit": 101}, {"limit": "abc"}, {"offset": -1}, {"offset": "1.5"}):
                self.assertEqual(self.client.get(f"/api/v1/{collection}", params=params).status_code, 422)
        special = self.create("observations", batch_id="LOT%_\\A", sample_type="feed")
        self.create("observations", batch_id="LOT%_\\A", sample_type="silage")
        response = self.client.get("/api/v1/observations", params={"batch_id": "LOT%_\\A", "sample_type": "feed"})
        self.assertEqual(response.json()["items"], [special])
        self.assertEqual(self.client.get("/api/v1/observations", params={"batch_id": "' OR 1=1--"}).json()["total"], 0)
        self.assertEqual(self.client.get("/api/v1/observations", params={"sample_type": "other"}).status_code, 422)

    def test_batch_identity_is_unique_immutable_and_preserves_history_keys(self):
        batch = self.create("batches", batch_id=" LOT-01 ")
        duplicate = self.client.post("/api/v1/batches", headers=ORIGIN, json=resource_body("batches", batch_id=" LOT-01 ", name="Different name"))
        self.assertEqual(duplicate.status_code, 409, duplicate.text)
        separate = self.create("batches", batch_id=" LOT-01 ", sample_type="feed")
        self.assertNotEqual(separate["id"], batch["id"])
        untrimmed = self.create("batches", batch_id="LOT-01")
        self.assertNotEqual(untrimmed["id"], batch["id"])
        url = f"/api/v1/batches/{batch['id']}"
        for change in ({"batch_id": "LOT-01"}, {"sample_type": "feed"}):
            response = self.client.post(url, headers=ORIGIN, json={**resource_body("batches", batch_id=" LOT-01 "), **change})
            self.assertEqual(response.status_code, 409, response.text)
            self.assertEqual(self.client.get(url).json(), batch)
        edited = self.client.post(url, headers=ORIGIN, json=resource_body("batches", batch_id=" LOT-01 ", name="Edited name", quantity=0, quantity_unit="bags"))
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertEqual(edited.json()["created_at"], batch["created_at"])
        self.assertEqual(edited.json()["name"], "Edited name")
        self.assertEqual(edited.json()["quantity_unit"], "bags")

    def test_model_bounds_unknown_fields_and_scope_injection_are_rejected(self):
        invalid = {
            "batches": [{"batch_id": "x"}, {"batch_id": " " * 2}, {"batch_id": "x" * 81}, {"name": "x" * 121}, {"storage_location": "x" * 201}, {"quantity": -1}, {"quantity": True}, {"quantity": "1"}, {"quantity_unit": "lb"}, {"sample_type": "grain"}],
            "observations": [{"mould": False}, {"unusual_heat": "maybe"}, {"unusual_smell": None}, {"cover_damage": "NO"}, {"score": 50}, {"batch_id": "x"}],
            "reminders": [{"title": ""}, {"title": " "}, {"title": "x" * 201}, {"batch_id": "LOT-1"}, {"sample_type": "feed"}, {"status": "completed"}],
            "testing-requests": [{"contact_name": "x" * 121}, {"contact_details": "x" * 501}, {"status": "report_received"}, {"batch_id": "x"}],
        }
        for collection, changes in invalid.items():
            changes += [{"notes": "x" * 4001}, {"notes": None}, {"farm_id": self.account["farm"]["id"]}, {"owner_id": "injected"}, {"unexpected": True}]
            changes += [{"batch_id": "\x00A"}, {"batch_id": "LOT\n01"}]
            for change in changes:
                with self.subTest(collection=collection, change=str(change)[:100]):
                    response = self.client.post(f"/api/v1/{collection}", headers=ORIGIN, json=resource_body(collection, **change))
                    self.assertEqual(response.status_code, 422, response.text)
                    self.assert_private(response)
            self.assertEqual(self.client.get(f"/api/v1/{collection}").json()["total"], 0)

    def test_nonfinite_quantities_return_validation_errors_without_writing(self):
        for quantity in (float("nan"), float("inf"), -float("inf")):
            response = self.client.post("/api/v1/batches", headers={**ORIGIN, "Content-Type": "application/json"}, content=json.dumps(resource_body("batches", quantity=quantity)))
            self.assertEqual(response.status_code, 422, response.text)
            self.assert_private(response)
        self.assertEqual(self.client.get("/api/v1/batches").json()["total"], 0)

    def test_calendar_dates_are_strict_and_batch_dates_are_ordered(self):
        for collection, field in (("batches", "prepared_on"), ("batches", "opened_on"), ("observations", "observed_on"), ("reminders", "due_on"), ("testing-requests", "requested_on")):
            for value in ("2026-02-30", "2026-2-01", "20260201", "2026-01-01T00:00:00Z", "0000-01-01", "2026-01-01\n", "", 1770000000, True):
                with self.subTest(collection=collection, field=field, value=value):
                    response = self.client.post(f"/api/v1/{collection}", headers=ORIGIN, json=resource_body(collection, **{field: value}))
                    self.assertEqual(response.status_code, 422, response.text)
        bad_order = self.client.post("/api/v1/batches", headers=ORIGIN, json=resource_body("batches", prepared_on="2026-03-02", opened_on="2026-03-01"))
        self.assertEqual(bad_order.status_code, 422, bad_order.text)
        leap = self.create("batches", prepared_on="2024-02-29", opened_on="2024-02-29")
        invalid_update = self.client.post(f"/api/v1/batches/{leap['id']}", headers=ORIGIN, json=resource_body("batches", prepared_on="2026-02-02", opened_on="2026-02-01"))
        self.assertEqual(invalid_update.status_code, 422)
        self.assertEqual(self.client.get(f"/api/v1/batches/{leap['id']}").json(), leap)

    def test_reminders_complete_idempotently_and_reopen_without_invented_due_dates(self):
        reminder = self.create("reminders")
        self.assertEqual(reminder["status"], "pending")
        self.assertIsNone(reminder["completed_at"])
        self.assertIsNone(reminder["due_on"])
        complete = self.status("reminders", reminder["id"], status="completed")
        self.assertEqual(complete.status_code, 200, complete.text)
        self.assertIsNotNone(complete.json()["completed_at"])
        self.assertEqual(self.status("reminders", reminder["id"], status="completed").json(), complete.json())
        reopened = self.status("reminders", reminder["id"], status="pending")
        self.assertEqual(reopened.status_code, 200)
        self.assertIsNone(reopened.json()["completed_at"])
        for body in ({"status": "overdue"}, {"status": "completed", "due_on": "2026-01-01"}, {"status": "pending", "farm_id": "elsewhere"}):
            response = self.client.post(f"/api/v1/reminders/{reminder['id']}/status", headers=ORIGIN, json=body)
            self.assertEqual(response.status_code, 422, response.text)

    def test_assisted_request_forward_states_require_dates_and_a_stored_report(self):
        request = self.create("testing-requests", requested_on="2026-03-10")
        self.assertEqual(request["status"], "requested")
        for body in (
            {"status": "collected"}, {"status": "requested", "collected_on": "2026-03-10"},
            {"status": "collected", "collected_on": "2026-03-09"},
            {"status": "collected", "collected_on": "2026-03-10", "report_received_on": "2026-03-12"},
            {"status": "collected", "collected_on": "2026-3-10"},
            {"status": "collected", "collected_on": "2026-02-30"},
            {"status": "report_received", "collected_on": "2026-03-10", "report_received_on": "2026-03-12"},
        ):
            response = self.status("testing-requests", request["id"], **body)
            self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(self.client.get(f"/api/v1/testing-requests/{request['id']}").json(), request)
        collected = self.status("testing-requests", request["id"], status="collected", collected_on="2026-03-10")
        self.assertEqual(collected.status_code, 200, collected.text)
        for body in ({"status": "requested"}, {"status": "collected", "collected_on": None}, {"status": "report_received"}, {"status": "report_received", "report_received_on": "2026-03-09"}, {"status": "report_received", "report_received_on": "2026-03-11"}):
            self.assertEqual(self.status("testing-requests", request["id"], **body).status_code, 422)
        response = self.upload("testing-requests", request["id"], payload=PDF, content_type="application/pdf")
        self.assertEqual(response.status_code, 201, response.text)
        received = self.status("testing-requests", request["id"], status="report_received", report_received_on="2026-03-11")
        self.assertEqual(received.status_code, 200, received.text)
        self.assertEqual(received.json()["collected_on"], "2026-03-10")
        self.assertEqual(received.json()["report_count"], 1)
        for body in ({"status": "collected"}, {"status": "requested"}, {"status": "report_received", "report_received_on": None}, {"status": "report_received", "collected_on": "2026-03-12"}, {"status": "cancelled"}, {"status": "report_received", "farm_id": "other"}):
            self.assertEqual(self.status("testing-requests", request["id"], **body).status_code, 422)

    def test_forward_request_jump_requires_both_dates_and_its_own_attachment(self):
        request = self.create("testing-requests", requested_on="2026-03-01")
        other = self.create("testing-requests")
        self.assertEqual(self.upload("testing-requests", other["id"]).status_code, 201)
        dates = {"status": "report_received", "collected_on": "2026-03-01", "report_received_on": "2026-03-01"}
        self.assertEqual(self.status("testing-requests", request["id"], **dates).status_code, 422)
        self.assertEqual(self.upload("testing-requests", request["id"]).status_code, 201)
        self.assertEqual(self.status("testing-requests", request["id"], **dates).status_code, 200)

    def test_every_route_requires_a_live_session_including_metadata_and_bytes(self):
        anonymous = self.new_client()
        for collection in ("batches", "observations", "reminders", "testing-requests"):
            resource = self.create(collection)
            read_paths = [f"/api/v1/{collection}"]
            if collection != "reminders":
                read_paths.append(f"/api/v1/{collection}/{resource['id']}")
                attachment = self.upload(collection, resource["id"]).json()
                read_paths.extend([attachment["url"].rsplit("/", 1)[0], attachment["url"]])
                self.assertEqual(self.upload(collection, resource["id"], client=anonymous).status_code, 401)
            for path in read_paths:
                response = anonymous.get(path)
                self.assertEqual(response.status_code, 401, response.text)
                self.assert_private(response)
            response = anonymous.post(f"/api/v1/{collection}", headers=ORIGIN, json=resource_body(collection))
            self.assertEqual(response.status_code, 401, response.text)
            if collection == "batches":
                self.assertEqual(anonymous.post(f"/api/v1/batches/{resource['id']}", headers=ORIGIN, json=resource_body(collection)).status_code, 401)
            if collection in {"reminders", "testing-requests"}:
                self.assertEqual(self.status(collection, resource["id"], client=anonymous, status="pending" if collection == "reminders" else "requested").status_code, 401)
        response = self.client.post("/api/v1/auth/logout", headers=ORIGIN)
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.client.get(attachment["url"]).status_code, 401)

    def test_foreign_ids_and_attachment_parent_substitution_are_404_and_scope_cannot_change(self):
        other = self.new_client()
        other_account = self.register(other, "other")
        for collection in ("batches", "observations", "reminders", "testing-requests"):
            resource = self.create(collection)
            own_path = f"/api/v1/{collection}/{resource['id']}"
            if collection != "reminders":
                self.assertEqual(other.get(own_path).status_code, 404)
                attachment_response = self.upload(collection, resource["id"])
                self.assertEqual(attachment_response.status_code, 201, attachment_response.text)
                attachment = attachment_response.json()
                for path in (attachment["url"], attachment["url"].rsplit("/", 1)[0]):
                    response = other.get(path)
                    self.assertEqual(response.status_code, 404, response.text)
                    self.assert_private(response)
                self.assertEqual(self.upload(collection, resource["id"], client=other).status_code, 404)
                another = self.create(collection, **({"batch_id": "ANOTHER"} if collection == "batches" else {}))
                substituted = attachment["url"].replace(resource["id"], another["id"])
                self.assertEqual(self.client.get(substituted).status_code, 404)
                self.assertEqual(self.client.get(attachment["url"].rsplit("/", 1)[0] + f"/{uuid4()}").status_code, 404)
            if collection == "batches":
                self.assertEqual(other.post(own_path, headers=ORIGIN, json=resource_body(collection)).status_code, 404)
            if collection in {"reminders", "testing-requests"}:
                response = self.status(collection, resource["id"], client=other, status="completed" if collection == "reminders" else "requested")
                self.assertEqual(response.status_code, 404, response.text)
            self.assertEqual(other.get(f"/api/v1/{collection}").json()["total"], 0)
            for params in ({"farm_id": self.account["farm"]["id"]}, [("farm_id", other_account["farm"]["id"]), ("farm_id", self.account["farm"]["id"])]):
                self.assertEqual(other.get(f"/api/v1/{collection}", params=params).status_code, 403)
        # Farm uniqueness does not prevent another farm from tracking the same key.
        duplicate = other.post("/api/v1/batches", headers=ORIGIN, json=resource_body("batches"))
        self.assertEqual(duplicate.status_code, 201, duplicate.text)
        self.assertEqual(duplicate.json()["farm_id"], other_account["farm"]["id"])
        for collection in ("batches", "observations", "testing-requests"):
            self.assertEqual(self.client.get(f"/api/v1/{collection}/not-a-uuid").status_code, 404)

    def test_members_can_work_and_viewers_read_but_cannot_mutate_any_resource(self):
        member = self.role_client("member")
        viewer = self.role_client("viewer")
        for collection in ("batches", "observations", "reminders", "testing-requests"):
            resource = self.create(collection, client=member)
            self.assertEqual(viewer.get(f"/api/v1/{collection}").status_code, 200)
            self.assertEqual(viewer.post(f"/api/v1/{collection}", headers=ORIGIN, json=resource_body(collection)).status_code, 403)
            if collection != "reminders":
                self.assertEqual(viewer.get(f"/api/v1/{collection}/{resource['id']}").status_code, 200)
                response = self.upload(collection, resource["id"], client=member)
                self.assertEqual(response.status_code, 201, response.text)
                for path in (response.json()["url"], response.json()["url"].rsplit("/", 1)[0]):
                    self.assertEqual(viewer.get(path).status_code, 200)
                self.assertEqual(self.upload(collection, resource["id"], client=viewer).status_code, 403)
            if collection == "batches":
                path = f"/api/v1/batches/{resource['id']}"
                self.assertEqual(member.post(path, headers=ORIGIN, json=resource_body(collection, name="Member edit")).status_code, 200)
                self.assertEqual(viewer.post(path, headers=ORIGIN, json=resource_body(collection, name="Viewer edit")).status_code, 403)
            if collection in {"reminders", "testing-requests"}:
                body = {"status": "completed"} if collection == "reminders" else {"status": "collected", "collected_on": "2026-03-10"}
                self.assertEqual(self.status(collection, resource["id"], client=member, **body).status_code, 200)
                self.assertEqual(self.status(collection, resource["id"], client=viewer, **body).status_code, 403)

    def test_all_mutation_routes_inherit_origin_csrf_and_private_error_headers(self):
        for collection in ("batches", "observations", "reminders", "testing-requests"):
            resource = self.create(collection)
            writes = [(f"/api/v1/{collection}", {"json": resource_body(collection)})]
            if collection == "batches":
                writes.append((f"/api/v1/batches/{resource['id']}", {"json": resource_body(collection)}))
            if collection in {"reminders", "testing-requests"}:
                writes.append((f"/api/v1/{collection}/{resource['id']}/status", {"json": {"status": "pending" if collection == "reminders" else "requested"}}))
            if collection != "reminders":
                segment = "reports" if collection == "testing-requests" else "photos"
                writes.append((f"/api/v1/{collection}/{resource['id']}/{segment}", {"content": image_bytes()}))
            for path, options in writes:
                for headers in ({}, {"Origin": "https://untrusted.example"}, {"Origin": "null"}):
                    response = self.client.post(path, headers=headers, **options)
                    self.assertEqual(response.status_code, 403, response.text)
                    self.assert_private(response)

    def test_all_image_parents_normalize_formats_strip_metadata_and_sanitize_filenames(self):
        for collection in ("batches", "observations", "testing-requests"):
            resource = self.create(collection)
            for format, content_type, suffix in (("PNG", "image/png", ".png"), ("JPEG", "image/jpeg", ".jpg"), ("WEBP", "image/webp", ".webp")):
                response = self.upload(collection, resource["id"], payload=image_bytes(format, metadata=True), content_type=content_type, **{"X-Filename": '..\\folder/"secret.svg'})
                self.assertEqual(response.status_code, 201, response.text)
                self.assert_private(response)
                attachment = response.json()
                self.assertEqual(set(attachment), {"id", "filename", "content_type", "url", "created_at"})
                self.assertEqual(attachment["filename"], "_secret" + suffix)
                listing = self.client.get(attachment["url"].rsplit("/", 1)[0])
                self.assertIn(attachment, listing.json())
                self.assert_private(listing)
                downloaded = self.client.get(attachment["url"])
                self.assertEqual(downloaded.status_code, 200)
                self.assert_private(downloaded)
                self.assertEqual(downloaded.headers["content-type"], content_type)
                self.assertTrue(downloaded.headers["content-disposition"].startswith("attachment;" if collection == "testing-requests" else "inline;"))
                with Image.open(io.BytesIO(downloaded.content)) as normalized:
                    self.assertEqual(normalized.getexif(), {})
                    for key in ("exif", "icc_profile", "comment", "private"):
                        self.assertNotIn(key, normalized.info)
            field = "report_count" if collection == "testing-requests" else "photo_count"
            self.assertEqual(self.client.get(f"/api/v1/{collection}/{resource['id']}").json()[field], 3)
        self.assertEqual(self.client.get("/uploads/secret.pdf").status_code, 404)

    def test_pdf_reports_have_basic_signature_eof_checks_and_are_download_only(self):
        request = self.create("testing-requests")
        for payload in (b"", b"%PDF-1.7\nmissing EOF", b"hello\n%%EOF", b"\x00%PDF-1.7\n%%EOF", PDF + b"<script>", b"%PDF-not-real\n%%EOF"):
            response = self.upload("testing-requests", request["id"], payload=payload, content_type="application/pdf")
            self.assertEqual(response.status_code, 400, response.text)
        response = self.upload("testing-requests", request["id"], payload=PDF, content_type="application/pdf", **{"X-Filename": "../../lab.html"})
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["filename"], "lab.pdf")
        downloaded = self.client.get(response.json()["url"])
        self.assertEqual(downloaded.content, PDF)
        self.assertEqual(downloaded.headers["content-type"], "application/pdf")
        self.assertEqual(downloaded.headers["content-disposition"], 'attachment; filename="lab.pdf"')
        self.assert_private(downloaded)
        for collection in ("batches", "observations"):
            parent = self.create(collection)
            self.assertEqual(self.upload(collection, parent["id"], payload=PDF, content_type="application/pdf").status_code, 415)

    def test_attachment_types_corrupt_images_dimensions_and_header_bounds(self):
        batch = self.create("batches")
        for content_type, payload, status in (
            ("text/html", b"<script>alert(1)</script>", 415),
            ("image/svg+xml", b"<svg/>", 415),
            ("image/png", b"not an image", 400),
            ("image/png", image_bytes("JPEG"), 400),
        ):
            response = self.upload("batches", batch["id"], payload=payload, content_type=content_type)
            self.assertEqual(response.status_code, status, response.text)
        for length in (str(MAX_PHOTO_BYTES + 1), "invalid", "-1", "9" * 5000):
            response = self.upload("batches", batch["id"], payload=b"x", **{"Content-Length": length})
            self.assertEqual(response.status_code, 413, response.text)
        output = io.BytesIO()
        Image.new("RGB", (1, 8193)).save(output, "PNG")
        self.assertEqual(self.upload("batches", batch["id"], payload=output.getvalue()).status_code, 413)
        request = self.create("testing-requests")
        self.assertEqual(self.upload("testing-requests", request["id"], payload=b"x", content_type="application/pdf", **{"Content-Length": str(MAX_REPORT_BYTES + 1)}).status_code, 413)

    def test_streamed_limits_do_not_trust_missing_or_understated_content_length(self):
        batch = self.create("batches")
        request = self.create("testing-requests")
        for collection, resource, content_type, maximum in (
            ("batches", batch, "image/png", MAX_PHOTO_BYTES),
            ("testing-requests", request, "application/pdf", MAX_REPORT_BYTES),
            ("testing-requests", request, "image/png", MAX_PHOTO_BYTES),
        ):
            for headers in ({}, {"Content-Length": "1"}):
                def chunks():
                    yield b"%PDF-1.7\n" if content_type == "application/pdf" else b"PNG"
                    for _ in range(maximum // (512 * 1024)):
                        yield b"x" * (512 * 1024)
                response = self.upload(collection, resource["id"], payload=chunks(), content_type=content_type, **headers)
                self.assertEqual(response.status_code, 413, response.text)
        self.assertEqual(self.client.get(f"/api/v1/batches/{batch['id']}/photos").json(), [])
        self.assertEqual(self.client.get(f"/api/v1/testing-requests/{request['id']}/reports").json(), [])

    def test_exact_pdf_size_boundary_and_report_image_smaller_limit(self):
        request = self.create("testing-requests")
        large_pdf = b"%PDF-1.7\n" + b"x" * (MAX_REPORT_BYTES - len(b"%PDF-1.7\n\n%%EOF\n")) + b"\n%%EOF\n"
        self.assertEqual(len(large_pdf), MAX_REPORT_BYTES)
        response = self.upload("testing-requests", request["id"], payload=large_pdf, content_type="application/pdf")
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(len(self.client.get(response.json()["url"]).content), MAX_REPORT_BYTES)
        self.assertEqual(self.upload("testing-requests", request["id"], payload=large_pdf + b"\n", content_type="application/pdf").status_code, 413)

    def test_normalized_image_size_is_bounded_as_well_as_original_input(self):
        # The real normalizer's output can be larger than a compressed input.
        with patch("app.main.normalize_photo", return_value=b"x" * (MAX_PHOTO_BYTES + 1)):
            app = create_app(self.database)
        client = self.new_client(app)
        client.cookies.update(self.client.cookies)
        batch = self.create("batches", client=client)
        response = self.upload("batches", batch["id"], client=client)
        self.assertEqual(response.status_code, 413, response.text)
        self.assertEqual(client.get(f"/api/v1/batches/{batch['id']}/photos").json(), [])

    def test_concurrent_attachment_uploads_cannot_exceed_five_for_any_parent(self):
        token = self.client.cookies.get(COOKIE_NAME)
        for collection in ("batches", "observations", "testing-requests"):
            parent = self.create(collection)
            segment = "reports" if collection == "testing-requests" else "photos"
            url = f"/api/v1/{collection}/{parent['id']}/{segment}"
            def upload(_):
                with TestClient(self.app) as client:
                    client.cookies.set(COOKIE_NAME, token)
                    return client.post(url, headers={**ORIGIN, "Content-Type": "image/png"}, content=image_bytes())
            with ThreadPoolExecutor(max_workers=8) as pool:
                responses = list(pool.map(upload, range(8)))
            self.assertEqual(sorted(response.status_code for response in responses), [201] * 5 + [409] * 3)
            self.assertEqual(len(self.client.get(url).json()), 5)

    def test_concurrent_duplicate_creates_and_lazy_initialization_are_atomic(self):
        token = self.client.cookies.get(COOKIE_NAME)
        def create(_):
            with TestClient(self.app) as client:
                client.cookies.set(COOKIE_NAME, token)
                return client.post("/api/v1/batches", headers=ORIGIN, json=resource_body("batches"))
        with ThreadPoolExecutor(max_workers=6) as pool:
            responses = list(pool.map(create, range(6)))
        self.assertEqual(sorted(response.status_code for response in responses), [201] + [409] * 5)
        self.assertEqual(self.client.get("/api/v1/batches").json()["total"], 1)

    def test_fieldwork_initialization_is_additive_and_preserves_scans_photos_auth_and_legacy_rows(self):
        scan = self.client.post("/api/v1/scans", headers=ORIGIN, json={"batch_id": "OLD-1", "sample_type": "silage", "inputs": INPUTS})
        self.assertEqual(scan.status_code, 201, scan.text)
        photo = self.client.post(f"/api/v1/scans/{scan.json()['scan']['id']}/photos", headers={**ORIGIN, "Content-Type": "image/png"}, content=image_bytes())
        self.assertEqual(photo.status_code, 201, photo.text)
        tables = ("farms", "users", "sessions", "scans", "photos")
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("INSERT INTO farms VALUES ('legacy-farm', 'Legacy Farm', '2020-01-01T00:00:00+00:00')")
            db.execute("INSERT INTO scans (id, farm_id, batch_id, sample_type, source_mode, device_id, collected_at, created_at, inputs_json, result_json) SELECT ?, 'legacy-farm', batch_id, sample_type, source_mode, device_id, collected_at, created_at, inputs_json, result_json FROM scans LIMIT 1", (str(uuid4()),))
            rows_before = {table: db.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall() for table in tables}
            schema_before = {row[0]: row[1] for row in db.execute("SELECT name, sql FROM sqlite_master WHERE type = 'table'")}
        self.create("batches", batch_id="OLD-1")
        restarted = self.new_client(create_app(self.database))
        restarted.cookies.update(self.client.cookies)
        self.assertEqual(restarted.get("/api/v1/batches").json()["total"], 1)
        self.assertEqual(restarted.get(f"/api/v1/scans/{scan.json()['scan']['id']}").json(), scan.json())
        self.assertEqual(restarted.get(photo.json()["url"]).status_code, 200)
        with closing(sqlite3.connect(self.database)) as db, db:
            for table in tables:
                self.assertEqual(db.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall(), rows_before[table])
                self.assertEqual(db.execute("SELECT sql FROM sqlite_master WHERE name = ?", (table,)).fetchone()[0], schema_before[table])
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.assertEqual(restarted.get("/api/v1/scans/search").json()["total"], 1)

    def test_installer_and_default_app_creation_perform_no_database_io(self):
        supplier = Mock(side_effect=AssertionError("Installer resolved repository eagerly"))
        def user():
            return {"farm_id": "unresolved"}
        with patch("app.storage.SQLiteRepository._connect", side_effect=AssertionError("Opened database before lifespan")):
            install_fieldwork_routes(FastAPI(), supplier, user, user, lambda payload, content_type: payload)
            default_app = create_app()
        supplier.assert_not_called()
        self.assertIsNone(default_app.state.repository)
        self.assertIn("/api/v1/batches", {route.path for route in default_app.routes})

    def test_supplier_resolves_default_repository_after_asgi_lifespan(self):
        database = Path(self.temp.name) / "lifespan.sqlite3"
        with patch.dict(os.environ, {"NUTRI_SCAN_DB": str(database)}):
            application = create_app()
            self.assertFalse(database.exists())
            with TestClient(application) as client:
                self.assertIsNotNone(application.state.repository)
                self.register(client, "lifespan-owner")
                response = client.post("/api/v1/batches", headers=ORIGIN, json=resource_body("batches"))
                self.assertEqual(response.status_code, 201, response.text)
                self.assertEqual(client.get("/api/v1/batches").json()["total"], 1)


if __name__ == "__main__":
    unittest.main()
