# Deployment, backup, migration and rollback runbook

**Operational recipe; not evidence of a deployment.** Use an approved release and
pre-existing Python/backend environment and Node/frontend dependencies. Provisioning,
service units, TLS certificates, backup encryption and alerting are operator-owned;
they are not included in this repository. Existing start/check commands are in the
[README](../../../README.md) and [backend README](../../../backend/README.md).

## 1. Environment contract

| Environment | Network / cookies | Storage / use |
| --- | --- | --- |
| Development | localhost 5173 → Vite proxy → 8000; secure cookie false only for local HTTP | Disposable dev DB; no real farm data |
| Staging | Separate HTTPS hostname, same-origin `/api` proxy, secure cookie true | Separate DB, generated accounts and synthetic fixtures; production-like restore/migration rehearsal |
| Production / restricted pilot | Approved HTTPS hostname, same-origin `/api` proxy preferred, secure cookie true; backend loopback/private only | Durable absolute DB path, encrypted backups, named operators and approved release scope |

Use different databases, accounts, backup locations and configuration for each.
Production paths/domains below are **placeholders**. Do not copy farm data into
staging without an approved minimized/pseudonymized dataset and retention plan.

| Variable | Current meaning |
| --- | --- |
| `NUTRI_SCAN_DB` | Backend SQLite file; default is `backend/data/nutri_scan.sqlite3`. Relative overrides resolve from process working directory, so deploy with an absolute path. |
| `NUTRI_SCAN_ORIGINS` | Comma-separated explicit origins (scheme + host + optional port, no paths/wildcards). Localhost/127.0.0.1 ports 5173/5174 are **always added**; this variable does not replace them. Mutations also accept the API's own origin. |
| `NUTRI_SCAN_COOKIE_SECURE` | Backend `true` for HTTPS; default false. Session cookie is `nutri_scan_session`, HttpOnly, SameSite=Lax, path `/`, seven-day lifetime. |
| `VITE_PUBLIC_API_URL` | Public build-time API origin for a separately hosted frontend; use empty for same-origin. Legacy fallback is `VITE_API_URL`. Both must be empty for an unambiguous same-origin build. |
| `VITE_PROXY_TARGET` | Local Vite dev/preview proxy target; not a production reverse proxy or secret. |

Backend variables must be supplied by the shell/supervisor; Uvicorn is not configured
here to load a root `.env` automatically. Vite build-time variables are public and
embedded into assets. Never place passwords, tokens, TLS keys or backup encryption
keys in `VITE_*`, the frontend bundle, firmware or release evidence.

**Separate origins:** a same-site HTTPS API subdomain may work with credentialed
requests and the exact frontend origin configured. Truly cross-site hosting can fail
because cookies are SameSite=Lax and browser policy applies. Do not assume CORS changes
that cookie rule. Prove register/login/reload/upload/logout on target browsers or use
the same-origin topology. Always-present dev origins need a recorded threat review
and appropriate edge/network restrictions before wider exposure.

## 2. Local development

From `backend/`, using its existing virtual environment (Terminal A):

```bash
NUTRI_SCAN_COOKIE_SECURE=false .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

This uses the default local DB unless explicitly overridden. From `frontend/`
(Terminal B), override legacy URL settings to retain the cookie-friendly proxy:

```bash
VITE_PUBLIC_API_URL= VITE_API_URL= VITE_PROXY_TARGET=http://127.0.0.1:8000 npm run dev -- --host 127.0.0.1
```

Open `http://localhost:5173`. `/api` and `/health` proxy to the backend. For the
clean single-container build, copy `.env.example` to `.env` at the repository root
and run `docker compose up --build`; it builds the locked frontend/backend image,
serves the static application and API on port 8000, and persists SQLite in a named
volume. The Compose command is a reproducible local/restricted-pilot recipe, not a
production approval or a substitute for the HTTPS/recovery gates below. No Compose
build was executed while preparing this document because the local Docker daemon was
unavailable.

## 3. Candidate build and staging

Run the [QA commands](qa-test-plan.md) in an isolated checkout/workspace, preserving
existing local edits. From `frontend/`, for same-origin hosting:

```bash
VITE_PUBLIC_API_URL= VITE_API_URL= npm run build
```

Retain the complete `frontend/dist/`, including hashed assets, `sw.js`, manifest,
icons and offline help. Record artifact digests and build environment. PWA generation
requires Vite's production mode and deployment at **root `/`**; subpath hosting is
not supported by the current plugin. Rehearse with a local production preview:

```bash
VITE_PUBLIC_API_URL= VITE_API_URL= VITE_PROXY_TARGET=http://127.0.0.1:8123 npm run preview -- --host 127.0.0.1 --port 5174 --strictPort
```

The matching isolated API/DB setup is in [QA](qa-test-plan.md). For actual staging,
serve the candidate static artifact behind its own HTTPS reverse proxy and use a
separate absolute `NUTRI_SCAN_DB`; do not use Vite preview as the staging/production
service supervisor. Test the same configuration and first authenticated fieldwork
request that production will use.

## 4. HTTPS production topology and startup

Substitute an approved domain, static release path, TLS files and service account.
Example backend process command from the deployed `backend/` directory:

```bash
NUTRI_SCAN_DB=/srv/nutriscan-data/PLACEHOLDER_PRODUCTION.sqlite3 \
NUTRI_SCAN_ORIGINS=https://nutriscan.example.invalid \
NUTRI_SCAN_COOKIE_SECURE=true \
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 \
  --proxy-headers --forwarded-allow-ips=127.0.0.1
```

An operator-provided supervisor must supply the same environment, working directory,
restart policy and restricted user. Use one API process initially; SQLite write
contention and process-local login throttling are not solved by adding workers.
Restrict registration/exposure at the edge for an approved closed pilot; there is
no built-in invitation-only deployment switch. Review recovery/removal/admin gaps
before a public multi-tenant launch.

Illustrative Nginx server blocks (configure on the host, not in this docs pack):

```nginx
server {
    listen 80;
    server_name nutriscan.example.invalid;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    server_name nutriscan.example.invalid;
    ssl_certificate /etc/PLACEHOLDER_TLS/fullchain.pem;
    ssl_certificate_key /etc/PLACEHOLDER_TLS/private-key.pem;
    root /srv/nutriscan/releases/PLACEHOLDER_RELEASE/frontend/dist;
    client_max_body_size 11m;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header Origin $http_origin;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache off;
    }
    location = /health {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache off;
    }
    location = /sw.js {
        add_header Cache-Control "no-cache" always;
        try_files $uri =404;
    }
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files $uri =404;
    }
    location / {
        add_header Cache-Control "no-cache" always;
        try_files $uri $uri/ /index.html;
    }
}
```

Serve `.webmanifest` as `application/manifest+json` (or `application/json`), JS/CSS
with correct types, and `offline.html` as `text/html`. Verify host MIME mappings.
Do not rewrite `/api/*` errors to SPA HTML. Do not cache private requests at a CDN;
preserve API `Cache-Control: no-store`, `nosniff` and `Set-Cookie`. Keep unknown
Hosts rejected by the host's default vhost. Trust forwarded headers only from the
actual proxy, and prevent direct public access to port 8000. Add HSTS only after
the HTTPS/certificate/subdomain rollout has been rehearsed.

Read-only edge probes after setting the real HTTPS origin:

```bash
export APP_ORIGIN=https://nutriscan.example.invalid
curl --fail --show-error --silent "$APP_ORIGIN/health"
curl --show-error --silent -D - -o /dev/null "$APP_ORIGIN/api/v1/auth/me"
curl --fail --show-error --silent -I "$APP_ORIGIN/sw.js"
curl --fail --show-error --silent -I "$APP_ORIGIN/manifest.webmanifest"
```

Expected: health 200 with `status: ok`; unauthenticated `auth/me` 401 with
`no-store`/`nosniff`; static responses 200 with appropriate types. `/health` is
static service status, not a DB readiness probe. Complete authenticated QA in the
browser, inspecting cookie flags without exporting cookie values into evidence.

## 5. Consistent SQLite backup

Back up before startup/migration, legacy assignment, model/app release or deletion.
The DB includes account/session hashes and photo/report BLOBs: protect the whole
backup as private farm data. Do not copy only a live `.sqlite3` file with ordinary
`cp`; use SQLite's backup API to include committed state consistently.

Set **absolute, operator-provisioned** paths. `BACKUP_DIR` must already exist,
be owner-only and be on approved encrypted storage outside web roots/repository.
Confirm the parent directories, then use a unique output filename:

```bash
export NUTRI_SCAN_DB=/srv/nutriscan-data/PLACEHOLDER_PRODUCTION.sqlite3
export BACKUP_DIR=/srv/nutriscan-backups/PLACEHOLDER_PRIVATE_DIRECTORY
ls -ld "$BACKUP_DIR" "$(dirname "$NUTRI_SCAN_DB")"
export BACKUP_PATH="$BACKUP_DIR/pre-release-$(date -u +%Y%m%dT%H%M%SZ).sqlite3"
python3 - "$NUTRI_SCAN_DB" "$BACKUP_PATH" <<'PY'
import os, sqlite3, sys
from pathlib import Path
source, target = map(lambda p: Path(p).resolve(), sys.argv[1:])
assert source.is_file() and source != target
assert target.parent.is_dir() and target.parent.stat().st_mode & 0o077 == 0
fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
os.close(fd)
src = sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)
dst = sqlite3.connect(target)
try:
    src.backup(dst)
    integrity = dst.execute('PRAGMA integrity_check').fetchall()
    foreign_keys = dst.execute('PRAGMA foreign_key_check').fetchall()
    assert integrity == [('ok',)] and not foreign_keys, (integrity, foreign_keys)
finally:
    dst.close()
    src.close()
print('Backup verified:', target)
PY
sha256sum "$BACKUP_PATH"
```

If this fails, mark the artifact failed and investigate; a leftover file is not a
verified backup. Record checksum, timestamp, size, release/schema pairing, encryption
location, retention expiry and restore evidence in the restricted backup log. The
commands set private file permissions but **do not encrypt**; host storage encryption
and encrypted off-host transfer must already be configured and tested.

## 6. Migration and restore rehearsal

There is no versioned migration runner or down-migration command. Backend startup
initializes tables and adds missing scan columns; fieldwork tables initialize lazily
on first fieldwork access. Rehearse both against a **copy**, then compare counts,
attachments, legacy visibility, roles, old scan/report readback and idempotency.
Do not infer backward compatibility from “additive”. Record the actual schema and
code version together; never hand-edit production schema as an improvised migration.

Restore a verified backup into a **new**, unused file on an existing private test
directory. Stop any service that could use the restore destination. Substitute real
approved paths; this leaves the source backup and live DB untouched:

```bash
export RESTORE_DB=/srv/nutriscan-restore/PLACEHOLDER_UNIQUE_RESTORE.sqlite3
ls -ld "$(dirname "$RESTORE_DB")"
python3 - "$BACKUP_PATH" "$RESTORE_DB" <<'PY'
import os, sqlite3, sys
from pathlib import Path
source, target = map(lambda p: Path(p).resolve(), sys.argv[1:])
assert source.is_file() and source != target
assert target.parent.is_dir() and target.parent.stat().st_mode & 0o077 == 0
fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
os.close(fd)
src = sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)
dst = sqlite3.connect(target)
try:
    src.backup(dst)
    assert dst.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
    assert not dst.execute('PRAGMA foreign_key_check').fetchall()
    # Restored historical sessions must not become valid again.
    dst.execute('DELETE FROM sessions')
    dst.commit()
finally:
    dst.close()
    src.close()
print('Restored with sessions revoked:', target)
PY
```

Reconcile the deletion ledger **before** restored data is exposed. From the selected
release's `backend/`, use the restored DB on an unused loopback port:

```bash
NUTRI_SCAN_DB="$RESTORE_DB" NUTRI_SCAN_COOKIE_SECURE=false \
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8123
```

Use the isolated frontend/QA procedure, generate no real outbound shares, and record
actual recovery time and recoverable data age. Stop rehearsal processes afterward.
For real cutover pause writes at the edge, drain/stop the old API, take a final
verified backup, then start the candidate and complete authenticated fieldwork
smoke tests before reopening writes.

Legacy assignment is a separate **explicit data-ownership change**, never automatic:
after reviewing source legacy farm, destination owner and backup, from `backend/`:

```bash
NUTRI_SCAN_DB=/srv/nutriscan-data/PLACEHOLDER_PRODUCTION.sqlite3 \
.venv/bin/python -m app.admin assign-legacy \
  --username PLACEHOLDER_EXISTING_OWNER --farm-id PLACEHOLDER_UNOWNED_LEGACY_FARM
```

Verify exact scan IDs and attachments under the intended farm and that other farms
cannot read them. Record authorization and before/after counts without raw data.

## 7. PWA deployment, update and rollback

- Publish the complete static release atomically; retain the previous artifact and
  its hashed assets for existing tabs. For a new release, carry forward older hashed
  assets from the approved artifact store during the transition, or use an equivalent
  immutable asset route. A new HTML file with missing old chunks breaks open tabs.
- Serve the new `sw.js` with revalidation. Worker cache identity includes public
  assets and policy. Updates **wait for explicit user activation**; do not force
  reload while readings are unsaved. On activation, older namespace caches are removed.
- Inspect Cache Storage: only allowlisted static assets/help/manifest/icons, never
  API/auth/history/photos/reports or personalized `index.html`. Public offline help
  must remain public and carry no account details.
- Test online load, update notification, explicit update, offline reload and all
  three help languages on HTTPS target devices. Installation availability depends
  on browser policy; manual browser installation may be required.

## 8. Rollback and recovery

Trigger on cross-farm exposure, unsafe claims, corruption/data loss, broken login,
failed migration or required acceptance failures. Incident lead owns the decision.

1. Restrict access/pause writes; announce impact and preserve redacted logs plus a
   verified post-failure DB snapshot. Record the last known good release and time.
2. If schema/data compatibility was proven in staging, stop the candidate, restore
   the prior backend and full frontend artifact/configuration, retain the current
   DB, then run readback and write smoke tests before reopening.
3. If compatibility is unknown or data changed incompatibly, keep service closed.
   Restore the pre-change backup into a new DB as above, invalidate sessions,
   reconcile deletions and obtain approval for the known recovery-point data loss.
   Reconcile post-backup operations from preserved evidence; do not blindly replay
   writes or offline queues. Same farm/request ID with changed content returns 409.
4. Switch the supervisor's DB path/release pointer while stopped, then restart under
   the old approved code. Supervisor commands depend on the host's actual unit; no
   universal `systemctl` unit or deployment script is supplied here.
5. Redeploy the **old worker and its assets together**, revalidate `sw.js`, and guide
   users through explicit update after saving/handling drafts. Do not indiscriminately
   clear all site storage: it can destroy unsynced drafts. Verify cache/privacy again.
6. Re-run scoped QA, verify counts/attachment downloads, monitor, communicate recovery
   and complete the [incident review](support-and-incident-runbook.md). Document any
   unrecoverable scans, permissions changes or sample provenance gaps.

Use [governance](data-governance-and-privacy.md) for backup/deletion controls and
[production launch checklist](production-launch-checklist.md) for go/no-go evidence.
