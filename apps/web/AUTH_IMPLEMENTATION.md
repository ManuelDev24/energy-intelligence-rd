# ERD-WEB-AUTH — web account auth integrated with the real backend

Implemented only under `apps/web/**` of this isolated `auth-web` copy. No shared
package, lockfile, or dependency change. Integrates with the backend contract in
`../../services/api/AUTH_IMPLEMENTATION.md` (`/api/v1/auth/{register,login,logout,me}`,
`/api/v1/homes`, etc.) through a Next.js **backend-for-frontend (BFF)**, not direct
browser calls.

## Why a BFF, and what it guarantees

The browser never sees `access_token`/`refresh_token`. Login/registration set two
`HttpOnly`, `SameSite=Strict`, `Secure`-in-production cookies on the **same origin**
(`__Host-`-prefixed when secure): one carries the access token (`Max-Age` = the API's
`expires_in`), the other carries the refresh token for revocation only. No JavaScript,
no React prop, no rendered HTML ever contains a token value — verified by an automated
no-leak assertion in both unit tests and the live integration script (below).

All browser traffic to the domain API goes through `/api/bff/[...path]` (`apps/web/src/app/api/bff/[...path]/route.ts`
→ `apps/web/src/lib/auth/bff.ts`). The handler:
- Allowlists exactly the existing domain routes (`/homes`, `/homes/{id}`, `/homes/{id}/bills[...]`,
  `/homes/{id}/equipment[...]`, `/homes/{id}/alerts[...]`, `/homes/{id}/dashboard`), the Phase 2
  routes listed in "Phase 2 allowlist" below, plus `/auth/{login,register,logout,me}`. Everything
  else is `404`, including `/auth/refresh` (never implemented client-side — see "No silent refresh" below).
- Builds the upstream URL itself from a server-only `API_BASE_URL`; the client never
  supplies a host, so there is no SSRF via user input. `redirect: "manual"` on the
  upstream fetch turns any 3xx into a `502` instead of being followed.
- Requires `Origin` to equal the configured `WEB_ORIGIN` on every non-`GET`, and treats a
  present `Sec-Fetch-Site` other than `same-origin` the same way — this is the CSRF
  defense (double-submit tokens are unnecessary because the cookies are never readable
  or replayable cross-site and the origin check blocks simple/CORS cross-site POSTs).
- Re-validates every request/response body against the project's existing Zod contracts
  (`@energyrd/api-contracts`, including the freshly exported `UserOutSchema`/`TokensOutSchema`)
  plus a BFF-local `writeSchema()` that forbids unknown fields (`role`, `user_id`, `home_id`,
  smuggled `refresh_token`, …) on every domain write — mirroring the backend's own
  "unknown fields forbidden" rule at the edge.
- Never forwards a browser-supplied `Authorization` or `Cookie` header upstream; it reads
  only its own named cookies and attaches exactly one `Authorization: Bearer <access>` itself.
- Sets `Cache-Control: no-store, private` and `Vary: Cookie` on every response.

## Phase 2 allowlist (ERD-CONS-01 / ERD-GOAL-01)

`phase2Route()` in `src/lib/auth/bff.ts` declares each new route with **method + path pattern +
exact query + strict body + response contract**. Everything is validated before any upstream
contact; the response is re-parsed with the `@energyrd/api-contracts` schema (contract mismatch → `502`).

| Method | Path (`{id}` = UUID) | Query (each at most once; unknown/repeated → `400`) | Body (strict; unknown field → `422`) | Response schema |
| --- | --- | --- | --- | --- |
| GET | `/homes/{id}/readings` | `limit` (1–3 digits), `offset` (1–6 digits) | — | `ReadingSchema[]` |
| POST | `/homes/{id}/readings` | none | `{read_at: ISO datetime **with offset**, reading_kwh: "^\d{1,10}(\.\d{1,2})?$", note?: ≤255 \| null}` | `ReadingSchema` |
| DELETE | `/homes/{id}/readings/{reading_id}` | none | empty `{}` | `204` |
| GET | `/homes/{id}/consumption` | **required** `granularity` ∈ day\|week\|month, `from`, `to` (valid `YYYY-MM-DD`) | — | `ConsumptionSchema` |
| GET | `/homes/{id}/goal` | none | — | `GoalSchema \| null` |
| PUT | `/homes/{id}/goal` | none | `{monthly_amount_rd?, monthly_kwh?}` decimal text `> 0` or null; at least one non-null | `GoalSchema` |
| GET | `/homes/{id}/goal/progress` | optional `on` (`YYYY-MM-DD`) | — | `GoalProgressSchema` |
| GET | `/tariffs` | `distributor` ∈ EDESUR\|EDENORTE\|EDEESTE, `on`, `limit`, `offset` | — | `TariffSchema[]` |

- Still rejected (`404`, no upstream call): `PUT/PATCH /readings`, `GET /readings/{id}` (the API has
  no such route), non-UUID ids, sub-paths, `POST /consumption`, `DELETE`/`POST /goal`,
  `PUT /goal/progress`, `POST /tariffs`, `/tariffs/{id}`.
- `/tariffs` is public in the API, but through the BFF it still requires a session (the web only
  uses it inside the app); without cookies it is `401` like every other domain route.
- Errors stay local Spanish: `409` on readings → "Ya existe una lectura con esa fecha y hora.";
  `422 invalid_input` on readings → "La lectura debe ser mayor o igual que la anterior y menor o igual
  que la siguiente."; `422 invalid_input` on consumption → "Rango de fechas inválido: máximo 366
  días."; field table extended with `read_at`, `reading_kwh`, `note`, `monthly_amount_rd`, `monthly_kwh`.
  Upstream `detail` (which for readings includes the meter values) is never forwarded.
- The UI additionally maps every error by status/code/field name only (`src/lib/api/errors.ts`), so
  the legacy pilot (direct API, no BFF) never renders upstream text on Phase 2 screens either.
- Tests: `src/lib/auth/bff-phase2.test.ts` (allowed routes reach upstream with the cookie bearer;
  unlisted methods/paths, bad/extra/repeated query params and non-strict bodies are rejected without
  contacting upstream; cross-origin writes `403`; no session `401`; upstream leaks replaced by local text).
  Live: `scripts/verify_phase2_bff.py` (see `PHASE2_UI.md`).

## No silent refresh, no retry-on-ambiguity

The backend's refresh endpoint is intentionally **not exposed**. The web client performs
no automatic token refresh and no transparent retry of a failed mutation:
- A `401` from the upstream API on any request triggers `window.dispatchEvent(new Event("energyrd.session-expired"))`;
  `SessionProvider` (`src/lib/session.tsx`) handles it by clearing the home, the user and the
  whole React Query cache, then surfacing "La sesión venció. Inicia sesión de nuevo." The user
  must log in again — there is no refresh race to lose.
- A network error (`fetch` throwing, e.g. `TypeError`) during `login`/`register`/`logout`
  is reported as a failure and **not retried**; `bff.ts`'s own upstream `fetch` is not retried
  either. `createOwnedHome` behaves the same way (unit-tested: exactly one upstream call on
  a `TypeError`).
- Cross-tab coordination is a `localStorage` broadcast key (`energyrd.account-change`): every
  login/logout/expiry writes a new UUID to it, and every tab's `storage` listener re-verifies
  `/auth/me` and clears local state. A focus-regained tab also re-verifies (keeping the current
  home only if the account identity it gets back is unchanged), so two tabs cannot end up acting
  as different accounts. There is no token to race over since the browser never holds one.

## Security fixes after independent review (late login, stale bodies, error text)

1. **A late login cannot restore a session after logout.** Aborting `fetch` does not stop a
   `Set-Cookie`, so the defense is server-side and stateless: the BFF keeps a per-browser
   **auth epoch** cookie (`__Host-erd-epoch`/`erd-epoch`, HttpOnly, SameSite=Strict, 400 days).
   - Every logout (including the no-cookie and network-failure paths) rotates the epoch.
   - Login/register bind both session cookies to the epoch sent **with the login request**
     (`<epoch>~<token>`). Without an epoch, login/register get a local `428 auth_epoch_required`
     with a fresh epoch and no upstream call; `accountRequest` retries exactly once.
   - Any authenticated request whose cookies are bound to a different/missing epoch gets `401`
     and the BFF **revokes that refresh token upstream** (`POST /auth/logout {refresh_token}`).
     It does not clear cookies on reads (a late clear could erase a newer login).
   - `middleware.ts` forwards only access + epoch + logout cookies to its `/auth/me` probe.
   - `SessionProvider.authenticate()` re-checks its generation after every `await`; a superseded
     attempt never publishes its user, issues one `/auth/me` sweep (triggering the BFF revocation)
     and rejects with "La sesión cambió en otra pestaña. Inicia sesión de nuevo."
   - Residual (documented, fail-closed): a login whose response arrives *before* a concurrent
     logout's response has its cookies cleared by that logout; its refresh family is unreachable
     from the browser and expires per backend policy. Two concurrent first-time 428 epochs can
     invalidate one fresh login (user logs in again).
2. **No previous-account body after an account switch.** `bffFetch` checks the account generation
   when headers arrive, reads the body itself, checks again, and returns a copy whose `json()`/`text()`
   check before and after reading. Stale data rejects with `AccountChangedError`
   (`ApiError` 409, `code: "account_changed"`, non-retryable under `retryPolicy`). `createOwnedHome`
   rethrows it (not the ambiguous-network message) and re-checks before resolving.
3. **No upstream free text on screen.** `safeError()` in `bff.ts` ignores upstream `detail`/`msg`:
   messages are local Spanish chosen by status and route (401 login → "Credenciales inválidas.",
   409 register → "Ya existe una cuenta con este correo electrónico.", 5xx → "Error del servidor.
   Inténtalo de nuevo más tarde.", etc.). 422 field errors are emitted only for fields in the
   `FIELD_MESSAGES` allowlist (credential, home, bill, equipment, alert fields) with local text;
   unknown fields are dropped. `code`/`request_id` pass only if they match strict patterns. The BFF's
   own Zod validation uses the same table. `accountRequest` never surfaces a non-JSON body
   (e.g. proxy HTML): it falls back to the status-based message.

## Reset on logout/switch

`SessionProvider.signOut()`/`authenticate()` both call a single `reset()` that: cancels in-flight
React Query requests, calls `queryClient.clear()` (wipes **all** cached private data, not just the
home-scoped keys), clears the selected `homeId` from both state and `localStorage`, and aborts any
in-flight `bffFetch` calls via a generation counter (`invalidateAccountRequests`, unit-tested: a
pending request rejects after an account switch instead of resolving into the new account's view).
Logout also calls `/api/bff/auth/logout`, which revokes the whole refresh family server-side and
clears both cookies regardless of the upstream outcome (network error included).

## Home selection, not pilot claiming

With auth enabled, `GET /homes` is naturally scoped server-side to the caller's memberships (no
client-side filtering needed — see backend contract). `/homes` (`src/app/(account)/homes/page.tsx`)
lists only those and lets the user create a new one (`createOwnedHome`, `POST /api/bff/homes` with
only `{name, distributor}` — no `code`/owner/role field the user could use to claim a pilot home).
A freshly registered account starts with an empty list, matching the backend's explicit "no
automatic pilot assignment" rule.

## Routing / protected navigation

`src/middleware.ts` gates `/dashboard`, `/consumption`, `/readings`, `/goal`, `/bills`, `/equipment`,
`/alerts`, `/homes`, `/account` at the edge: it checks for the access cookie and asks the BFF's own `/auth/me` whether it
is still valid, redirecting anonymous/expired requests to `/login` **before any page renders**.
Middleware was deliberately chosen over a Server Component cookie check
(`cookies()` from `next/headers` in a layout): that approach was prototyped first and discarded
after the live integration script caught Next's dev-mode RSC instrumentation embedding the raw
cookie **values** (name/value pairs) into the rendered HTML for its own devtools — a real token
leak the task explicitly forbids. Middleware never touches `next/headers` and does not exhibit this.
`AppShell`/`AccountFrame` additionally gate client-side rendering on `useSession()` so protected
content never flashes before the redirect commits.

## Dev pilot default preserved / production fail-closed

- `NEXT_PUBLIC_AUTH_ENABLED` unset or `false` in `development`/`test` preserves the existing
  local pilot exactly: `/api/bff/*` returns `404`, `/login` renders the original home-picker
  (moved verbatim to `src/components/pilot-login.tsx`), and `src/lib/session.tsx` falls back to
  its original `localStorage`-only `homeId` behavior with no network calls.
- `next.config.mjs` throws at config-load time (`next build`/`next start`) when
  `NODE_ENV` is outside `development`/`test` and `NEXT_PUBLIC_AUTH_ENABLED !== "true"` — i.e. a
  production build of the no-auth pilot is refused, verified in this task (`npm run build`
  without the flag fails with `Production requires NEXT_PUBLIC_AUTH_ENABLED=true`). The same
  function also rejects non-HTTPS/credentialed/pathful `API_BASE_URL`/`WEB_ORIGIN` in production.
- `readBffConfig()` in `src/lib/auth/bff.ts` re-asserts the same guards at request time (defense
  in depth if a deployment somehow bypassed the build-time check), and additionally refuses a
  credentialed `API_BASE_URL`/`WEB_ORIGIN` or one with a path/query in *any* environment.

## Honest UX

`src/components/account-form.tsx` is the single login/register form: local Spanish error text mapped by the BFF
("Credenciales inválidas", 422 field errors, 409 conflict, network-ambiguous message) is shown in
a `role="alert"` region next to the password field, which is cleared after every submit attempt.
Labels are bound (`<Field label htmlFor>`), inputs carry `autoComplete`, `inputmode`-correct types,
`16px`-equivalent text size on mobile (`text-base sm:text-sm`, avoiding iOS input zoom), and the
submit button stays enabled with a busy state rather than disabling until valid, per the project's
accessibility conventions. A dedicated card states plainly: **"La recuperación de contraseña no
está disponible. Guarda tu contraseña de forma segura."** — no fake "forgot password" link exists
anywhere in the auth UI, matching the backend's documented limitation.

## Config

| Var | Where | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_AUTH_ENABLED` | build + runtime | `"true"` turns on account auth/BFF; anything else (or unset) keeps the legacy pilot. Must be explicit `"true"`/`"false"`. |
| `API_BASE_URL` | server only | Upstream FastAPI origin the BFF forwards to. Credential-free, path-free HTTP(S) origin; HTTPS required outside dev/test. |
| `WEB_ORIGIN` | server only | This app's own public origin, used for the CSRF `Origin` check. Same constraints as `API_BASE_URL`. |

`NEXT_PUBLIC_API_URL` (legacy pilot var) is unchanged and only used when auth is disabled.

## Limits (unchanged from the backend, explicitly not re-promised here)

No password recovery, email verification, MFA, or account erasure/export UI — the backend doesn't
have them either. No client-side rate limiting/CAPTCHA (a trusted gateway must provide this, per
the backend doc). Session expiry always requires a fresh login; there is deliberately no refresh UX.
This is a frontend integration of the backend's documented v1 slice, not a claim of a complete
production account system.

## Testing / verification actually run

All commands run from `apps/web/` with Node 24 (`fnm use 24`), from this isolated `auth-web` copy.

```sh
npm test --workspace apps/web        # vitest
npm run typecheck --workspace apps/web
npm run lint --workspace apps/web
NEXT_PUBLIC_AUTH_ENABLED=true API_BASE_URL=https://api.energy.example WEB_ORIGIN=https://energy.example \
  npm run build --workspace apps/web # production build with auth enabled
npm run build --workspace apps/web   # production build WITHOUT the flag → fails closed (expected)
```

Actual results obtained in this task:
- After the review fixes: `npm test --workspace apps/web` → **100 passed, 5 skipped** (20 files);
  root `npm run typecheck` exit 0; `npm run lint --workspace apps/web` clean; production build
  (`NEXT_PUBLIC_AUTH_ENABLED=true`, `https://*.example.invalid`) succeeds (`ƒ Middleware 34.4 kB`);
  `scripts/verify_auth_bff.py` against `:8011` PASS including the new late-login steps below.
- Original run: `vitest run`: **89 passed, 5 skipped** (the 5 skips are the pre-existing `LIVE_API_URL`-gated
  integration suite, unrelated to auth), 0 failed, across 18 files including every legacy
  pre-existing test (`ui-kit`, `bill-form`, `dashboard-page`, `bills-page`, `insights-pages`,
  `cache-invalidation`, `env`, `format`, `mock-api`, `button`, `live.test` …) — all still green.
- `tsc --noEmit`: clean.
- `eslint src --ext .ts,.tsx`: clean.
- `next build` with `NEXT_PUBLIC_AUTH_ENABLED=true` + HTTPS `API_BASE_URL`/`WEB_ORIGIN`: succeeds,
  `ƒ Middleware 34.1 kB`, all 16 routes compiled (including `/api/bff/[...path]`).
- `next build` with the flag unset (simulating a forgotten production env var): **fails** with
  `Production requires NEXT_PUBLIC_AUTH_ENABLED=true` — confirmed non-negotiable fail-closed.
- Legacy pilot mode re-verified by hand after all changes: `npm run dev` (no env vars) serves
  `/login` (original home-picker) at `200`, `/dashboard` at `200`, and `/api/bff/homes` at `404`
  (auth routes genuinely absent in pilot mode) — exactly the pre-existing behavior.

### New unit test files (behavior/security)

| File | Covers |
| --- | --- |
| `src/lib/auth/bff.test.ts` | Production/pilot config fail-closed, credentialed/pathful origin rejection, CSRF origin check, SSRF/host/path allowlisting, no `/auth/refresh`, token-never-in-body/never-forwarded-credential assertions, cookie `HttpOnly`/`SameSite=strict`/`Secure`/`__Host-` prefixing, upstream-redirect rejection, unknown-field/smuggled-credential rejection on every write, stale-401-does-not-clear-a-newer-session, logout always clears cookies (incl. on network failure) without retry. |
| `src/lib/auth/client.test.ts` | Browser fetch wrapper strips any client-supplied `Authorization`/`Cookie`, only ever calls the same-origin `/api/bff/*` path (absolute/traversal URLs rejected before `fetch`), and in-flight requests reject after an account switch. |
| `src/lib/auth/session.test.tsx` | Account mode never restores a pilot `homeId` from `localStorage`; logout clears home **and** the full React Query cache and calls the real logout endpoint; session-expiry event does the same without ever calling `/auth/refresh`; cross-tab `storage` broadcast drops stale cached data immediately. |
| `src/lib/auth/homes.test.ts` | Home creation posts only `{name, distributor}` (no owner/pilot claim fields) and is not retried on an ambiguous network failure. |
| `src/components/account-form.test.tsx` | Labelled fields, real server error surfaced in `role="alert"`, password cleared after a failed attempt, and the explicit "no recovery link" statement is present with no recovery link rendered. |
| `src/middleware.test.ts` | The edge probe forwards only the access, epoch and revocation cookies. |
| `src/components/app-shell-auth.test.tsx` | Authenticated shell never renders protected children for a logged-out session (even with a stale cached home id) and routes an account with no selected home to `/homes` rather than `/dashboard`. |

### Live integration check against the disposable authenticated API

`apps/web/scripts/verify_auth_bff.py` drives a running `next dev` (with
`NEXT_PUBLIC_AUTH_ENABLED=true`) against the parent-provided isolated API
(`http://127.0.0.1:8011`, dedicated `energy_rd_auth_integration_test` DB — **not** the pilot DB).
It uses only freshly generated `erd-web-test-<uuid>@example.com` addresses and `secrets.token_urlsafe(32)`
passwords, never prints a token/password/cookie value, and only deletes the one home it just created.
Actual run in this task, every assertion passed:

Re-run after the review fixes adds: `auth epoch required before first login: HTTP 428`,
`logout rotated the auth epoch`, `error messages are local Spanish text`,
`late login obtained a real server session: HTTP 200 upstream`,
`late login cannot restore a session after logout: HTTP 401`,
`late login session revoked upstream: HTTP 401` (token checked directly against `:8011`, never printed).

```
anonymous me: HTTP 401
anonymous protected navigation: redirected to /login
cross-origin login rejected: HTTP 403
register: HTTP 201
cookie flags: HttpOnly / SameSite=strict / host-only verified
me after register: HTTP 200
authenticated protected HTML: HTTP 200, no token values serialized
new account has no pilot homes: HTTP 200
create owned home: HTTP 201
read back owned home: HTTP 200
dashboard via existing BFF route: HTTP 200
forbidden proxy host: HTTP 400
refresh deliberately unavailable: HTTP 404
logout: HTTP 200
me after logout: HTTP 401
revoked access rejected even before JWT expiry: HTTP 401
duplicate registration: HTTP 409
wrong credentials: HTTP 401
login: HTTP 200
same account home preserved server-side: HTTP 200
delete only fresh test home: HTTP 204
home deletion read back: HTTP 200
logout before account switch: HTTP 200
second account registration: HTTP 201
second account cannot see first account homes: HTTP 200
final logout: HTTP 200
PASS: real Next BFF / isolated authenticated API integration; tokens never printed
```

This run is what caught the Next dev-mode RSC cookie-serialization issue described above (first
run of "authenticated protected HTML" failed the no-leak assertion with the Server-Component
`cookies()` approach); after switching to middleware-based gating, the same check passes.

## Files changed/added (all under `apps/web/`)

New: `src/lib/auth/bff.ts`, `bff.test.ts`, `client.ts`, `client.test.ts`, `homes.ts`, `homes.test.ts`,
`session.test.tsx`; `src/app/api/bff/[...path]/route.ts`; `src/middleware.ts`; `src/components/account-form.tsx`,
`account-form.test.tsx`, `account-frame.tsx`, `pilot-login.tsx`, `app-shell-auth.test.tsx`;
`src/app/register/page.tsx`, `src/app/(account)/layout.tsx`, `src/app/(account)/account/page.tsx`,
`src/app/(account)/homes/page.tsx`; `src/styles.d.ts`; `scripts/verify_auth_bff.py`; this file.

Modified: `src/lib/session.tsx` (account-aware, cache/home reset, cross-tab sync), `src/lib/api/index.ts`
(BFF-routed client when auth is enabled), `src/lib/api/hooks.ts` (`useHomes` gated on session readiness),
`src/app/login/page.tsx` (switches between the real form and the preserved pilot picker),
`src/app/(app)/layout.tsx` (simplified; gating moved to middleware), `src/components/app-shell.tsx`
(account nav links, auth-aware redirect target), `next.config.mjs` (production fail-closed guard).

Unchanged by requirement: `packages/**`, root `node_modules`, backend, lockfiles, any file outside `apps/web/`.
