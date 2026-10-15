# Admin RBAC browser E2E

Runs two Playwright Chromium tests against **real** PostgreSQL, FastAPI and Next admin BFF on loopback. Requires the existing root `@playwright/test`, `uv`, a Chromium installation for Playwright, and local PostgreSQL credentials with `CREATEDB` permission. Do not run while another worker is changing the API.

```sh
cd frontend-web/admin
ADMIN_E2E_DATABASE_URL='postgresql+psycopg://<local-user>:<local-password>@127.0.0.1:5433/energy_rd_admin_e2e_test' npm run e2e
```

The URL is required, must point to exactly `energy_rd_admin_e2e_test` on loopback, and is passed in the environment (not a command argument). The runner **refuses an existing database**, creates it from scratch, applies current API migrations, registers two random test accounts over HTTP, promotes only its newly registered admin via `app.cli_bootstrap_admin`, launches the real API on 18317 and admin on 3317, runs Playwright, then kills its child process groups and drops the database in `finally`. It does not seed pilot data or touch pilot app ports. No reuse/keep mode. If force-killed, remove only this exact disposable DB after checking its identity; the guard in `e2e/db.py drop` is available from the API uv environment with `DATABASE_URL` set.

The specs verify ordinary-user 403s, admin roles/scopes, UI grant and revoke with immediate effect, audit rows, logout, and no browser-storage tokens. Output excludes traces, screenshots and video (they could contain cookies/PII). Server and CLI stdout/stderr are discarded. Do not publish the process environment or Playwright failure output without review. `npm run e2e:safety`, `npm run typecheck`, and `npm test` can be run without starting a stack. Direct `playwright test` is deliberately blocked; use the lifecycle runner.
