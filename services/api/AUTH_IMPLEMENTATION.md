# ERD-AUTH-01/02 — backend foundation

## Scope and activation

Implemented in the isolated `auth-backend` copy, only under `services/api/`.
No changes to frontend/shared JS contracts. OpenAPI is the backend contract; clients
must explicitly integrate it. Registration is **not** proof of email ownership.

- `AUTH_ENABLED=false` (default) preserves the existing **development-only** local
  pilot API without tokens. All `/api/v1/auth/*` endpoints return 404 in this mode.
  Do not expose this mode to an untrusted network.
- Set `AUTH_ENABLED=true` and supply `AUTH_SIGNING_KEY` through the environment or
  deployment secret manager. There is no fallback signing key. Generate at least
  32 random bytes with a CSPRNG (for example `secrets.token_urlsafe(48)`), store it
  securely, and use the same key on replicas. Do not paste it into source/logs.
  Validation rejects missing/short/repetitive/common-placeholder keys; this is a
  guardrail, not proof that an arbitrary supplied string has enough entropy.
- Authentication disabled outside `ENVIRONMENT=development` is a startup error,
  including staging/production. Existing deployment DB/CORS/seed/migration guards
  still apply. Enabled authentication also requires a valid key in development.
- `AUTH_ACCESS_TTL_SECONDS`: 60–900; default 900. `AUTH_REFRESH_TTL_DAYS`: 1–90;
  default 30. `AUTH_ISSUER=energy-rd-api`, `AUTH_AUDIENCE=energy-rd-clients`.
- Run Alembic `upgrade head` as a release step before enabling authentication.
  Migration `0006` adds `users`, `home_members`, `auth_sessions`, `refresh_tokens`.
  It does **not** assign existing/pilot homes to any user. A newly registered user
  sees an empty home list until they create a home or receive a trusted membership.
  Downgrade to `0005` deletes all auth data but preserves homes/bills/insights;
  backup first. Never downgrade an active authenticated deployment casually.

## HTTP contract

Base: `/api/v1/auth`. JSON, no cookies. Tokens must never be put in URL/query parameters.

| Method/path | Input | Successful result |
| --- | --- | --- |
| `POST /register` | `{email,password}` | 201, token pair; creates regular `user` and its first session atomically |
| `POST /login` | `{email,password}` | 200, token pair in a new independent session |
| `POST /refresh` | `{refresh_token}` | 200, rotated token pair; previous refresh token is consumed |
| `POST /logout` | `{refresh_token}` | 204, revokes that entire session/family; repeat with a known token is idempotent |
| `GET /me` | `Authorization: Bearer *** | 200, `{id,email,role,created_at}` |

Token pair: `{access_token,refresh_token,token_type:"bearer",expires_in:900}`
(`expires_in` reflects the configured TTL). Clients must replace **both** tokens on
refresh. Refresh/logout do not require a still-valid access token; possession of
the opaque refresh token authenticates the session operation. Unknown tokens fail
401; malformed refresh bodies fail 422. Known consumed tokens can still log out
the family. Logout does not revoke other independently logged-in sessions.

Credentials:
- Email: validated email address, max 254 characters, normalized to lowercase
  (including the local part). No email verification or delivery is performed.
- Password: 12–128 characters, exact value preserved, no truncation.
- Unknown credential/refresh fields are forbidden (422), including `role`,
  `user_id`, and `home_id`. Registration never accepts `admin`/`support` privileges.
- Duplicate normalized email: 409, generic conflict. Wrong password, missing user,
  inactive user, invalid session/token: 401, `Credenciales inválidas`, with
  `WWW-Authenticate: Bearer`. Credential shape/length errors are 422, not login
  failures. Auth validation responses omit input values/context to avoid echoing
  passwords/refresh tokens. Responses use the existing `detail`, `code`,
  `request_id` error envelope. Successful auth responses carry `Cache-Control: no-store`.
- `/me` never exposes password hashes, refresh hashes or session internals.

JWT access tokens use HS256 with a restricted algorithm allowlist and required
`sub`, `sid`, `jti`, `iat`, `nbf`, `exp`, `iss`, `aud`, `type=access` claims. Signature,
expiry/not-before, issuer/audience and UUID identities are validated. Max accepted
access-token length is 4096 characters. JWTs are signed, **not encrypted**: no
password/email/private home data is placed in the payload. Each protected request
also checks the session and active user in PostgreSQL: logout/reuse revocation
rejects subsequently authenticated requests even before JWT expiry.

Passwords use Argon2id (64 MiB, time cost 3, parallelism 4), with unique salts and
rehash-on-login. Missing users use a dummy hash verification, not a fast password
failure path. Opaque refresh tokens contain 32 CSPRNG bytes (43 URL-safe characters).
Only their SHA-256 digest is stored; no plaintext refresh token is persisted.

## Authorization / IDOR

A common dependency protects **all** existing home, bill, equipment, alert,
alert-settings and dashboard API operations. Tests compare their route matrix with
OpenAPI so a newly added private route cannot silently escape the coverage matrix.

- Missing/invalid access token: 401.
- Home membership absent, including a real unowned pilot home: 404, same as unknown
  home. `admin`/`support` do **not** bypass this check.
- `GET /api/v1/homes`: joins memberships **before** limit/offset pagination.
- `POST /api/v1/homes`: home, owner membership and existing audit write commit in
  one transaction. A failed membership write rolls back the home and audit too.
- `owner` and `member` can read and edit home data and its child resources.
  Only `owner` may delete the entire home (member gets 403). The owner check is a
  dedicated dependency on that route, not a comparison against raw UUID casing.
- Existing child queries also require their `home_id` to match: possession of a
  bill/equipment/alert UUID from home A does not make it accessible through home B,
  even if the user belongs to both homes.
- Mutations lock home then membership, consistent with existing home transaction
  locks. Authorization and mutation use the same request DB session/transaction.
  Membership changes affect subsequent requests. Already-authorized in-flight
  requests are not cancelled by logout or membership removal.
- Membership/invitation/role-management endpoints are **not** in this slice.
  Memberships for pre-existing homes need a separately controlled, reviewed
  provisioning process; registering or setting an account role does not claim them.
- Domain service functions are internal trusted entry points, not independently
  authorized public APIs; new HTTP routes must attach the same dependencies.

## Rotation / concurrency

One login/registration creates one `auth_sessions` row (refresh family). Refresh
history is retained in `refresh_tokens`; every rotation consumes the presented row
and adds a new digest in the same transaction. Rotations, logout and reuse detection
serialize using a PostgreSQL `FOR UPDATE` lock on the family row, then reload the
refresh record after acquiring that lock.

Any reuse of a consumed refresh token revokes the **entire family**, including its
newest refresh token and access tokens. Revocation commits before returning 401.
Expired families/inactive users cannot refresh. Rotation does not extend the
family's absolute expiry. Concurrent refreshes of the same token yield one 200 and
one 401; the 401 revokes the winning response's family. This intentionally strict
policy has **no retry grace window**. Clients must single-flight refresh across
requests/tabs/devices sharing a token and must not retry an old token after network
ambiguity; prompt for login instead. Refresh concurrent with logout cannot revive
the session. Independent login sessions remain valid after reuse in another family.

## Verification (real PostgreSQL)

From `services/api/`:

```sh
env -u PYTHONPATH /opt/homebrew/bin/uv run python tests/run_isolated.py -q --tb=short
env -u PYTHONPATH /opt/homebrew/bin/uv run python tests/run_isolated.py --ignore=tests/test_auth.py --ignore=tests/test_authorization.py -q --tb=short
env -u PYTHONPATH /opt/homebrew/bin/uv run python -m compileall -q app tests
env -u PYTHONPATH /opt/homebrew/bin/uv lock --check
```

Actual initial results: **186 passed** (full suite), **145 passed** (existing/legacy suite
plus updated configuration/migration assertions), no skipped tests. After the coordinator fixed the independent review findings, the full suite passed **196 tests**, including 10 regression cases for SQL-log parameter redaction, indistinguishable foreign/unknown-home errors, and strict UTF-8 password validation. Compilation and
lockfile check succeeded. One existing Starlette warning: its httpx TestClient
integration is deprecated in favor of httpx2; runtime auth tests still execute.

The runner derives local credentials from `DEFAULT_DATABASE_URL` without printing
them and sets `TEST_DATABASE_URL` to `energy_rd_auth_test` programmatically. Existing
test URL safety checks still reject unsafe DB names/URLs. The application's unused
default engine points to a separate no-connect sentinel DB, and the client fixture
explicitly replaces `/health`'s module-level engine with the migrated test engine
(in addition to overriding `get_db`). Tests only create/reset the dedicated test DB,
not pilot/production schemas or Docker services/volumes. Do not run parallel pytest
processes against this single DB: migration fixtures intentionally reset its schema.

Covered: registration/hash persistence; normalized duplicate/concurrent registration;
login/me; no token, bad/expired/malformed/unsigned JWT and incorrect/missing claims;
refresh/logout, family reuse invalidation, expiry/inactive user; real concurrent
refresh and refresh/logout; authorization on every private route; owner/member
behavior; admin/support without bypass; wrong-parent child IDs; unowned homes;
atomic owner rollback; original CRUD with auth enabled; auth disabled legacy mode;
weak/missing key and deployment guards; `0006` downgrade/upgrade and full migration
roundtrip; model/migration metadata parity.

## Honest limits / release prerequisites

This is a backend foundation, **not a complete production account system**:
- No password recovery/reset endpoint, email verification, mail delivery, MFA,
  account erasure/export, privacy frontend, recovery frontend or auth UI. No stub
  claims these workflows work. Existing frontends are not wired to auth yet.
- Persistent per-peer register/login/refresh budgets now exist (migration `0010`);
  see `AUTH_ABUSE_PROTECTION.md` for limits, proxy trust and rollout. No CAPTCHA,
  account lockout or breached-password check. Gateway rate/body/header-size limits
  and abuse monitoring remain required; Argon2 is intentionally expensive.
- Duplicate registration status can reveal an existing email; failed login detail
  is generic, but no formal timing indistinguishability guarantee is made.
- No auth event audit/session-management UI, automated key rollover or cleanup job.
  Changing the single signing key invalidates current JWTs. Session/refresh history
  grows; cleanup must retain consumed-token history until its family can no longer
  be refreshed (deleting active history defeats reuse detection).
- HTTPS and correct proxy/CORS configuration are operational requirements. JSON
  refresh tokens are returned to clients: mobile must use secure platform storage;
  web must design its XSS/storage threat model before release. Cookies/CSRF
  handling would be a separate contract change, not an undocumented default here.
- Legacy mutation audit does not yet attribute actions to the authenticated user.
- No independently delegated support/admin access to private home data.

## ERD-AUTH-03: consentimiento y borrado de cuenta

- `POST /auth/register` exige `accept_terms: true` (literal JSON `true`; `false`, `1`, `"true"` o ausente → 422).
  El servidor guarda `LEGAL_TERMS_VERSION` (`app/services/legal.py`) y la fecha en `users.terms_version` /
  `users.terms_accepted_at` (migración 0012; NULL para cuentas legadas). El cliente no puede elegir versión.
- `GET /auth/me` expone `terms_version` y `terms_accepted_at`.
- `GET /api/v1/legal` (público, solo GET) devuelve `{terms_version, privacy_version, status: "draft"}`.
- `DELETE /auth/me` con `{password}`: ver `ACCOUNT_DELETION.md`. Borrador de privacidad y retención:
  `docs/legal/PRIVACY_AND_RETENTION_DRAFT.md`.
