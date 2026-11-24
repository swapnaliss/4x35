# Kiro Crew fixtures (M0-02)

Recorded on 2026-11-24 from a real Kiro Crew gateway, for M3-04's tests to replay. Synthetic data only: local paths
are replaced with `<TMPDIR>`, `<KIROCREW_HOME>` and `<HOME>`. Proxy signatures and auth tokens are never recorded,
and environment values appear only as `<type, length>`, except `PORT` and `KIROCREW_APP_NAME`.

## Crew version

**Kiro Crew 0.15.0**: a source checkout of `github.com/kirodotdev/KiroCrew` (default branch, shallow clone
2026-11-24), installed with `pip install -e .` into a Python venv. Kiro CLI 3.5.0 was on the host. Do not use the PyPI
package `kirocrew`: version 1.0.1 is an empty placeholder, not Crew.

## How each fixture was captured

The gateway ran headless on port 5676 with a short scratch `KIROCREW_HOME` and telemetry off:
`kirocrew gateway --headless --no-crons --no-tunnel --no-open --port 5676`. The app is `hello-4x35`, which has a Node
backend (`backend/server.mjs`) and an in-gateway Python hook (`backend.hooks:on_startup`). A 15-line Node echo server
listened on `127.0.0.1:8200`.

| File | Capture |
|---|---|
| `manifest-validation.json` | `kirocrew app install <dir>` and `kirocrew app enable hello-4x35` (output and exit codes, first refused until `kirocrew config set agent.apps_trusted '["hello-4x35"]'`); then `GET /api/apps/hello-4x35/manifest` (the normalised manifest) and `GET /api/apps/hello-4x35` (the app record). Plus `kirocrew app install` of a broken copy, with the gateway's three validation errors. |
| `app-context.json` | `GET /apps/hello-4x35/api/context` through the gateway proxy. The backend reports its argv, the `KIROCREW_*`/`PORT` env key names with value types, and the request headers (proxy headers redacted). Also the shape (member names → types) of the `AppContext` that the gateway passes to `on_startup`, written by the hook. |
| `fetch-roundtrip.json` | `GET /apps/hello-4x35/api/hello` through the gateway proxy. The backend calls `fetch()` (POST JSON) against the echo server and returns the outbound request and the response. The echo server's own log line is included. |

Authentication for the captures: `/api/*` needs the dashboard cookie `mc_token_<port>`. It is set by one request
carrying `?token=` from `kirocrew token`. `kirocrew token --bearer` only covers `/v1/*`.

## Can the SDK be imported outside the Crew runtime?

**No, and a backend does not need it.** `@kirocrew/app-sdk` is not published on npm (`npm view` returns 404). It has no
`defineApp`. It is a set of React hooks and UI components that the Crew dashboard provides to UI pages through an
import map at runtime, so UI code only runs inside Crew. An app backend is a plain process (Node here) that Crew starts
with `PORT` and `KIROCREW_*` env vars, behind its reverse proxy. The same `server.mjs` ran outside Crew (`PORT=9300`)
and served `/api/hello` with status 200. The Python client `kirocrew-client` (`verify_proxy_request`, `CrewClient`) is
also not on PyPI: it ships in the Crew repo at `packages/kirocrew-client-py`.

For M3-04: test the backend directly, and replay these fixtures for the gateway side (proxy path rewrite
`/apps/<name>/api/<x>` → `/api/<x>`, the validation errors, the context shape).
