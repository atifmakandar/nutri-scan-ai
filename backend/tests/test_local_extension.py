"""Backend-only tests for the local confirmation, device, alert, and audit loop."""

import copy
import json
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import create_app
from app.security import COOKIE_NAME


ORIGIN = {"Origin": "http://localhost:5173"}
PASSWORD = "local-extension-password"
PDF = b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n"
BASE_INPUTS = {
    "sensor": {"moisture_pct": 62, "ph": 4.2, "temperature_c": 24, "humidity_pct": 68},
    "nir": {"protein_pct": 8.8, "dry_matter_pct": 38, "fiber_pct": 28},
    "vision": {"mold_score": 0.08, "color_anomaly": 0.05, "surface_damage": 0.02},
}


def scan_body(batch_id="LOT-01", **changes):
    return {"batch_id": batch_id, "sample_type": "silage", "inputs": copy.deepcopy(BASE_INPUTS), **changes}


class LocalExtensionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.database = Path(self.temp.name) / "extension.sqlite3"
        self.environment = patch.dict(os.environ, {"NUTRI_SCAN_ORIGINS": "", "NUTRI_SCAN_COOKIE_SECURE": "false"})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.app = create_app(self.database)
        self.client = self.new_client()
        self.account = self.register(self.client, "owner")

    def new_client(self, app=None):
        client = TestClient(app or self.app)
        self.addCleanup(client.close)
        return client

    def register(self, client, username, farm_name="Local Farm"):
        response = client.post(
            "/api/v1/auth/register", headers=ORIGIN,
            json={"username": username, "password": PASSWORD, "farm_name": farm_name},
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def role_client(self, role):
        created = self.client.post(
            "/api/v1/members", headers=ORIGIN,
            json={"username": role, "password": PASSWORD, "role": role},
        )
        self.assertEqual(created.status_code, 201, created.text)
        client = self.new_client()
        logged_in = client.post(
            "/api/v1/auth/login", headers=ORIGIN,
            json={"username": role, "password": PASSWORD},
        )
        self.assertEqual(logged_in.status_code, 200, logged_in.text)
        return client

    def create_testing_request(self, **changes):
        body = {
            "batch_id": "LOT-01", "sample_type": "silage",
            "contact_name": "Local lab", "contact_details": "PRIVATE-CONTACT-SECRET",
            "notes": "SENSITIVE-REQUEST-NOTE", **changes,
        }
        response = self.client.post("/api/v1/testing-requests", headers=ORIGIN, json=body)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def upload_report(self, request_id, client=None):
        response = (client or self.client).post(
            f"/api/v1/testing-requests/{request_id}/reports", headers={**ORIGIN, "Content-Type": "application/pdf"},
            content=PDF,
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def receive_report(self, request):
        collected = self.client.post(
            f"/api/v1/testing-requests/{request['id']}/status", headers=ORIGIN,
            json={"status": "collected", "collected_on": "2026-10-15"},
        )
        self.assertEqual(collected.status_code, 200, collected.text)
        report = self.upload_report(request["id"])
        received = self.client.post(
            f"/api/v1/testing-requests/{request['id']}/status", headers=ORIGIN,
            json={"status": "report_received", "report_received_on": "2026-10-16"},
        )
        self.assertEqual(received.status_code, 200, received.text)
        return report

    def test_lab_confirmation_keeps_text_and_requires_exact_received_report(self):
        request = self.create_testing_request()
        body = {
            "testing_request_id": request["id"], "report_attachment_id": "missing-report",
            "analyte": "aflatoxin", "reported_value": "<0.1", "unit": "mg/kg",
        }
        before_report = self.client.post("/api/v1/lab-confirmations", headers=ORIGIN, json=body)
        self.assertEqual(before_report.status_code, 422, before_report.text)

        report = self.receive_report(request)
        body["report_attachment_id"] = report["id"]
        saved = self.client.post("/api/v1/lab-confirmations", headers=ORIGIN, json=body)
        self.assertEqual(saved.status_code, 201, saved.text)
        confirmation = saved.json()
        self.assertEqual(confirmation["reported_value"], "<0.1")
        self.assertEqual(self.client.get("/api/v1/lab-confirmations").json()["total"], 1)

        for value in (0.1, " ", None):
            invalid = {**body, "reported_value": value}
            self.assertEqual(self.client.post("/api/v1/lab-confirmations", headers=ORIGIN, json=invalid).status_code, 422)

        other_request = self.create_testing_request(batch_id="OTHER-01")
        other_report = self.receive_report(other_request)
        wrong_attachment = {**body, "report_attachment_id": other_report["id"], "reported_value": "trace"}
        self.assertEqual(self.client.post("/api/v1/lab-confirmations", headers=ORIGIN, json=wrong_attachment).status_code, 422)

        reopened = self.new_client(create_app(self.database))
        logged_in = reopened.post(
            "/api/v1/auth/login", headers=ORIGIN,
            json={"username": "owner", "password": PASSWORD},
        )
        self.assertEqual(logged_in.status_code, 200, logged_in.text)
        loaded = reopened.get(f"/api/v1/lab-confirmations/{confirmation['id']}")
        self.assertEqual(loaded.status_code, 200, loaded.text)
        self.assertEqual(loaded.json(), confirmation)

    def test_confirmation_scan_must_match_request_farm_batch_and_sample(self):
        request = self.create_testing_request()
        report = self.receive_report(request)
        matching = self.client.post("/api/v1/scans", headers=ORIGIN, json=scan_body())
        self.assertEqual(matching.status_code, 201, matching.text)
        body = {
            "testing_request_id": request["id"], "report_attachment_id": report["id"],
            "scan_id": matching.json()["scan"]["id"], "analyte": "pH",
            "reported_value": "4.2", "unit": "pH",
        }
        self.assertEqual(self.client.post("/api/v1/lab-confirmations", headers=ORIGIN, json=body).status_code, 201)
        other_scan = self.client.post("/api/v1/scans", headers=ORIGIN, json=scan_body(batch_id="OTHER-01"))
        self.assertEqual(other_scan.status_code, 201, other_scan.text)
        mismatch = {**body, "scan_id": other_scan.json()["scan"]["id"], "reported_value": "trace"}
        self.assertEqual(self.client.post("/api/v1/lab-confirmations", headers=ORIGIN, json=mismatch).status_code, 422)

    def test_device_registry_and_health_are_reported_or_reviewed_capture_only(self):
        registered = self.client.post(
            "/api/v1/devices", headers=ORIGIN,
            json={"device_id": "meter-17", "label": "Silo meter", "device_type": "pH meter", "notes": "Operator note"},
        )
        self.assertEqual(registered.status_code, 201, registered.text)
        device = registered.json()
        self.assertIsNone(device["latest_health"])

        reported = self.client.post(
            f"/api/v1/devices/{device['id']}/health", headers=ORIGIN,
            json={"status": "operational", "notes": "Operator checked cable"},
        )
        self.assertEqual(reported.status_code, 201, reported.text)
        self.assertEqual(reported.json()["source"], "operator_reported")

        capture_inputs = copy.deepcopy(BASE_INPUTS)
        capture = {
            "device_id": "meter-17", "captured_at": "2026-10-16T10:00:00+00:00",
            "calibration_status": "unknown",
            "readings": [
                {"field": "moisture_pct", "value": 62, "unit": "%"},
                {"field": "ph", "value": 4.2, "unit": "pH"},
            ],
        }
        scan = self.client.post(
            "/api/v1/scans", headers=ORIGIN,
            json=scan_body(source_mode="esp32", device_id="meter-17", collected_at="2026-10-16T10:00:00+00:00", inputs=capture_inputs, instrument_capture=capture),
        )
        self.assertEqual(scan.status_code, 201, scan.text)
        scan_id = scan.json()["scan"]["id"]
        health = self.client.get(f"/api/v1/devices/{device['id']}/health").json()
        self.assertEqual(health["total"], 2)
        self.assertEqual({item["source"] for item in health["items"]}, {"operator_reported", "reviewed_capture"})
        self.assertEqual(self.client.get(f"/api/v1/devices/{device['id']}").json()["latest_health"]["source"], "reviewed_capture")

        reviewed = self.client.post(
            f"/api/v1/devices/{device['id']}/health", headers=ORIGIN,
            json={"status": "unknown", "scan_id": scan_id},
        )
        self.assertEqual(reviewed.status_code, 201, reviewed.text)
        self.assertEqual(reviewed.json()["source"], "reviewed_capture")
        # The same reviewed capture is idempotent by its device/scan key.
        self.assertEqual(health["total"], 2)
        for invalid in (
            {"device_id": "another", "telemetry": {"temperature_c": 24}},
            {"device_id": "another", "calibration_status": "verified"},
        ):
            self.assertEqual(self.client.post("/api/v1/devices", headers=ORIGIN, json=invalid).status_code, 422)
        self.assertEqual(
            self.client.post(f"/api/v1/devices/{device['id']}/health", headers=ORIGIN, json={"source": "live_telemetry"}).status_code,
            422,
        )

    def test_alert_boundaries_and_per_scan_deduplication(self):
        boundary_inputs = copy.deepcopy(BASE_INPUTS)
        boundary_inputs["sensor"].update(ph=3.8, temperature_c=35)
        boundary_inputs["vision"].update(mold_score=0.35, color_anomaly=0.35)
        boundary_inputs["supplemental"] = {
            "mineral_concern_score": 0.49, "urea_concern_score": 0.49,
            "sand_silica_concern_score": 0.49, "aflatoxin_concern_score": 0.49,
            "fungal_concern_score": 0.49,
        }
        boundary = self.client.post("/api/v1/scans", headers=ORIGIN, json=scan_body(inputs=boundary_inputs))
        self.assertEqual(boundary.status_code, 201, boundary.text)
        self.assertEqual(self.client.get("/api/v1/review-alerts").json()["total"], 0)

        triggered_inputs = copy.deepcopy(boundary_inputs)
        triggered_inputs["sensor"].update(ph=3.7, temperature_c=35.01)
        triggered_inputs["vision"].update(mold_score=0.3501, color_anomaly=0.3501)
        for name in triggered_inputs["supplemental"]:
            triggered_inputs["supplemental"][name] = 0.5
        payload = scan_body(inputs=triggered_inputs, client_request_id="alert-retry")
        first = self.client.post("/api/v1/scans", headers=ORIGIN, json=payload)
        second = self.client.post("/api/v1/scans", headers=ORIGIN, json=payload)
        self.assertEqual(first.status_code, 201, first.text)
        self.assertEqual(second.status_code, 201, second.text)
        self.assertEqual(first.json(), second.json())
        alerts = self.client.get("/api/v1/review-alerts", params={"scan_id": first.json()["scan"]["id"]})
        self.assertEqual(alerts.status_code, 200, alerts.text)
        self.assertEqual(alerts.json()["total"], 9)
        self.assertEqual(len({item["code"] for item in alerts.json()["items"]}), 9)
        acknowledged = self.client.post(
            f"/api/v1/review-alerts/{alerts.json()['items'][0]['id']}/acknowledge", headers=ORIGIN,
        )
        self.assertEqual(acknowledged.status_code, 200, acknowledged.text)
        self.assertEqual(acknowledged.json()["status"], "acknowledged")
        self.assertEqual(self.client.get("/api/v1/review-alerts", params={"status": "acknowledged"}).json()["total"], 1)

    def test_permissions_farm_isolation_and_audit_redaction(self):
        request = self.create_testing_request()
        report = self.receive_report(request)
        confirmation = self.client.post(
            "/api/v1/lab-confirmations", headers=ORIGIN,
            json={
                "testing_request_id": request["id"], "report_attachment_id": report["id"],
                "analyte": "fungal marker", "reported_value": "not detected", "unit": "",
                "notes": "SENSITIVE-CONFIRMATION-NOTE",
            },
        )
        self.assertEqual(confirmation.status_code, 201, confirmation.text)
        device = self.client.post("/api/v1/devices", headers=ORIGIN, json={"device_id": "audit-meter"})
        self.assertEqual(device.status_code, 201, device.text)
        alert_inputs = copy.deepcopy(BASE_INPUTS)
        alert_inputs["vision"]["mold_score"] = 0.4
        alert_scan = self.client.post("/api/v1/scans", headers=ORIGIN, json=scan_body(batch_id="AUDIT-01", inputs=alert_inputs))
        self.assertEqual(alert_scan.status_code, 201, alert_scan.text)
        alert = self.client.get("/api/v1/review-alerts").json()["items"][0]
        viewer = self.role_client("viewer")
        for path in ("/api/v1/lab-confirmations", "/api/v1/devices", "/api/v1/review-alerts", "/api/v1/audit-events"):
            self.assertEqual(viewer.get(path).status_code, 200, path)
        self.assertEqual(
            viewer.post("/api/v1/lab-confirmations", headers=ORIGIN, json={}).status_code, 403,
        )
        self.assertEqual(
            viewer.post("/api/v1/devices", headers=ORIGIN, json={"device_id": "viewer-device"}).status_code, 403,
        )
        self.assertEqual(viewer.post(f"/api/v1/review-alerts/{alert['id']}/acknowledge", headers=ORIGIN).status_code, 403)

        other = self.new_client()
        other_account = self.register(other, "other", "Other Farm")
        self.assertNotEqual(other_account["farm"]["id"], self.account["farm"]["id"])
        for path in ("/api/v1/lab-confirmations", "/api/v1/devices", "/api/v1/review-alerts", "/api/v1/audit-events"):
            self.assertEqual(other.get(path).json()["total"], 0, path)
        self.assertEqual(other.get(f"/api/v1/lab-confirmations/{confirmation.json()['id']}").status_code, 404)
        self.assertEqual(other.get(f"/api/v1/devices/{device.json()['id']}").status_code, 404)

        audit = self.client.get("/api/v1/audit-events", params={"limit": 100})
        self.assertEqual(audit.status_code, 200, audit.text)
        actions = {event["action"] for event in audit.json()["items"]}
        self.assertTrue({
            "testing_request.created", "testing_report.uploaded", "testing_request.status_changed",
            "lab_confirmation.created", "device.registered",
        }.issubset(actions))
        serialized = json.dumps(audit.json(), sort_keys=True)
        for secret in ("PRIVATE-CONTACT-SECRET", "SENSITIVE-REQUEST-NOTE", "SENSITIVE-CONFIRMATION-NOTE", "not detected", "report bytes"):
            self.assertNotIn(secret, serialized)
        self.assertNotIn(self.client.cookies.get(COOKIE_NAME), serialized)

        with sqlite3.connect(self.database) as database:
            event_id = database.execute("SELECT id FROM app_audit_events LIMIT 1").fetchone()[0]
            with self.assertRaises(sqlite3.IntegrityError):
                database.execute("UPDATE app_audit_events SET action = 'redacted' WHERE id = ?", (event_id,))


if __name__ == "__main__":
    unittest.main()
