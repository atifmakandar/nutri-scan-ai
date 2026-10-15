# Nutri-Scan backend

## Install and test

From the repository root, create the pinned local environment and install the
exact runtime/test dependency set:

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
```

Run backend tests with:

```bash
.venv/bin/python -m unittest discover -s tests -p "test_*.py"
```

`requirements.txt` lists direct runtime dependencies; `requirements.lock` is the
exact-pinned install used by CI and the Dockerfile. `requirements-dev.txt` points
to the same complete lock because the current unit tests use the runtime HTTP test
client dependency.

## Configuration

The service uses SQLite at `NUTRI_SCAN_DB`, or `backend/data/nutri_scan.sqlite3`
when unset. Authentication uses:

- `NUTRI_SCAN_ORIGINS`: comma-separated explicit `http://` or `https://` origins
  for deployed frontends. Development origins are always
  `http://localhost:5173`, `http://localhost:5174`,
  `http://127.0.0.1:5173`, and `http://127.0.0.1:5174`. Credentials are never
  enabled for wildcard origins.
- `NUTRI_SCAN_COOKIE_SECURE`: `true`/`false`; set `true` when serving over HTTPS.

There is no bootstrap account or default password. Passwords are stdlib scrypt
hashes, and session values are random HttpOnly, SameSite=Lax cookies. Only a
SHA-256 token digest is stored in SQLite. Mutating `/api/v1/*` calls need one of
the configured `Origin` values (or the server's own origin).

## API contracts

Registration, login, and `GET /api/v1/auth/me` return:

```json
{
  "user": {"id": "uuid", "username": "owner", "role": "owner"},
  "farm": {"id": "uuid", "name": "Farm name"}
}
```

`POST /api/v1/auth/register` accepts `{username,password,farm_name}` and
creates a fresh farm and owner. `POST /api/v1/auth/login` accepts
`{username,password}`. `POST /api/v1/auth/logout` revokes the current session
and returns `204`. `POST /api/v1/members` is owner-only and accepts
`{username,password,role}`, where `role` is `member` or `viewer`; the owner can
list members with `GET /api/v1/members`.

All scan, history, analyze, and photo routes require a session. The farm is
always taken from that session. A supplied `farm_id` filter is only accepted
when it equals the session farm and is never used as the authorization scope.
Owners and members can create scans/photos; viewers can read them only.

`GET /api/v1/scans/search` accepts `batch_query` (literal substring), exact
`batch_id`, `sample_type`, `risk_level`, inclusive UTC `date_from`/
`date_to` (`YYYY-MM-DD`), `limit` (default 20, max 100), and `offset`. It
returns:

```json
{"items": [{"scan": {}, "result": {}}], "total": 1, "limit": 20, "offset": 0}
```

`GET /api/v1/scans` retains the list response and its batch/sample/limit
filters. `POST /api/v1/scans` accepts optional `client_request_id` (1–80
characters). The same ID and equivalent request in the same farm returns the
stored scan, including after restart; a different request returns `409`.

Photos are raw JPEG, PNG, or WebP request bodies, optionally named with
`X-Filename`. The request is streamed and limited to 5 MiB, decoded with
Pillow, dimension-limited, re-encoded, and stripped of metadata before being
stored as a SQLite BLOB. Each scan has at most five photos. The metadata list
is `GET /api/v1/scans/{scan_id}/photos`; bytes are private at
`GET /api/v1/scans/{scan_id}/photos/{photo_id}`. Photo bytes use `no-store` and
`nosniff`; no upload directory is publicly served.

## Legacy data migration

Existing farms/scans are migrated additively and remain inaccessible to HTTP
accounts until explicitly assigned. After creating an owner account, review the
target and run locally from `backend/`:

```bash
python -m app.admin assign-legacy --username owner --farm-id demo-farm
```

The command only accepts an existing owner and an unowned legacy farm. It
atomically changes scan farm ownership while preserving scan IDs and SQLite
photo foreign-key linkage. Do not run it automatically at startup.
