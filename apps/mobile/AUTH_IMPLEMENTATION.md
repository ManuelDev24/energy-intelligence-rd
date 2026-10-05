# Mobile account auth (ERD-MOB-AUTH)

Implemented under `apps/mobile/**` only. No package/dependency/lockfile edits — reused the
parent-installed `expo-secure-store@57.0.4` and existing `@energyrd/api-client`/`@energyrd/api-contracts`.

## What ships

- `src/auth/client.ts` — typed HTTP client for `/api/v1/auth/{register,login,refresh,logout,me}`.
  Validates email (≤254, format) and password (12–128 Unicode characters, exact value, never
  trimmed) client-side; normalizes email to lowercase before sending. Never surfaces raw server
  error bodies (a proxy/server could echo secrets) — maps status codes to fixed Spanish messages.
  Validates the shape of every token pair and `/me` response before trusting it (`parsePair`,
  `parseAccount`); a malformed response raises `ApiError(502, …)` instead of being used.
- `src/auth/session.ts` — the account state machine (`hydrating | busy | signedOut | authenticated`).
  - Single-flight refresh: concurrent `refreshAccess()` calls share one in-flight promise;
    a `rejectedAccess` token stale by the time it arrives is a no-op (another caller already
    rotated it).
  - Deletes the persisted pair **before** calling `/refresh`, so a crash/timeout/network-ambiguous
    failure never retries a consumed refresh token — it raises 401 and requires login, per the
    backend's strict reuse-revocation policy.
  - Every mutation is epoch-gated (`checkEpoch`): login/logout/hydrate bump an epoch; a stale
    in-flight request from a previous epoch (e.g. a refresh racing a `logout()`) cannot write back
    tokens or identity.
  - `onBoundary()` fires on every session boundary (login, logout, invalidate, hydrate) so the host
    app can clear React Query's cache and the selected-home store — this is wired in `runtime.ts`.
  - Hydration rotates the persisted refresh token once on launch (treats a saved pair as
    always-stale), re-validates identity via `/me`, and discards anything that fails to parse or
    whose `origin` doesn't match the current API URL (prevents a stale token surviving an API URL
    change, e.g. staging → prod).
- `src/auth/secureStore.ts` — `expo-secure-store` adapter (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), one
  key (`energyrd.auth.v1`), the only place tokens are persisted. AsyncStorage is never used for
  tokens or passwords.
- `src/auth/transport.ts` — wraps `fetch` for the **typed domain API only** (homes/bills/equipment/
  alerts): injects the bearer, retries exactly once through `session.refreshAccess()` on a 401,
  and forces full re-login on a second 401. Guards the epoch around header injection and JSON
  parsing so a logout racing an in-flight domain request cannot return stale personal data into
  the cache.
- `src/auth/policy.ts` — `hasOwnedSelection`: a persisted/selected home id is only honored if it
  appears in the account's own `/homes` list. `AppNavigator` calls this after login/register and
  resets the selection otherwise, so **registration can never silently land on the old pilot
  home** (a fresh account's home list is empty by backend contract).
- `src/api/homes.ts` — `createHome({name, distributor})`: the only client-settable fields; no
  `owner`/`user_id`/`home_id`/`code`/pilot fields are ever sent (server assigns membership).
- `src/features/auth/AuthScreen.tsx`, `AccountSummary.tsx`, `src/features/homes/CreateHomeForm.tsx`
  — Spanish UI using the existing `Field`/`Button`/`theme` tokens. Recovery is an explicit
  "unavailable" message (`auth-recovery-unavailable`), never a fake "email sent" success, matching
  the backend's documented absence of a recovery endpoint.
- `src/store/session.ts`, `src/api/hooks.ts`, `src/navigation/AppNavigator.tsx` — when
  `AUTH_ENABLED`, home/onboarding selection is **in-memory only** (no AsyncStorage persistence)
  and every React Query key is scoped by `['account', session.epoch, …]`; a boundary (login/
  logout/relogin as a different user) bumps the epoch, which both clears the whole cache via
  `onBoundary()` and makes any key from a stale epoch unreachable even if a stray reference
  survived.

## Activation flag

`EXPO_PUBLIC_AUTH_ENABLED` (`src/config.ts: resolveAuthEnabled`):
- Legacy pilot mode (`AppNavigator`'s `LegacyApp`, unauthenticated `fetch`, AsyncStorage-persisted
  home selection) is reachable **only** when the flag is the literal string `"false"` **and**
  `__DEV__` is true. Any other value, an unset flag, or a release/production build (`__DEV__ ===
  false`) forces `AUTH_ENABLED = true` — fails closed, no legacy bypass can reach a release binary
  even if the env var is mis-set. Verified by `src/config.test.ts`.

## Backend contract assumptions (from `AUTH_IMPLEMENTATION.md` in `auth-backend`)

Token pair shape, 900s default access TTL, strict single-use refresh rotation with whole-family
revocation on reuse, 401 on missing/invalid/expired/revoked session, `/me` returning
`{id,email,role,created_at}`, registration creating a user with **zero** home memberships. The
client treats all of these as hard invariants (tests assert each).

## Tests (mocked SecureStore + fetch; no native runtime)

`npm run typecheck && npm test` from `apps/mobile/`: **174 passed, 9 skipped** (was 83 before the
review fixes below; the new cases are mostly interleaving matrices) (skips are the
legacy pilot suite's intentionally-inactive cases plus the gated e2e below), 0 failed.

New/changed suites:
- `src/auth/client.test.ts` — request shaping, credential validation, generic error mapping.
- `src/auth/session.test.ts` (13 cases) — hydration gating, single-flight refresh under 8
  concurrent callers, no-retry-on-network-ambiguity, origin/corrupt-storage rejection, storage
  failure during login/refresh revokes the issued session, logout-races-refresh, revoked/expired
  refresh, a fresh login after logout is unaffected by a slow in-flight refresh from the previous
  account.
- `src/auth/transport.test.ts` — typed domain client gets the bearer, refreshes once on 401 then
  forces re-login on a second 401, logout racing an in-flight domain request rejects rather than
  resolving with stale data, no replay of a write on network ambiguity.
- `src/auth/secureStore.test.ts` — SecureStore (not AsyncStorage) adapter, write-failure
  propagation.
- `src/auth/runtime.test.ts` — hydration never reads the legacy AsyncStorage key; `invalidate()`
  clears the whole React Query cache and resets `selectedHomeId`/`onboardingDone` without
  persisting to AsyncStorage.
- `src/auth/policy.test.ts` — a persisted pilot home id is rejected unless it's in the account's
  own home list.
- `src/config.test.ts` — `resolveAuthEnabled` fail-closed matrix; `resolveApiUrl` HTTPS-only release
  policy and dev fallbacks.
- `src/api/errors.test.ts` — domain errors never carry server-authored text (see below).

### Real-backend integration proof (test-only, gated)

`src/e2e/authFlow.e2e.test.ts`, run with `AUTH_E2E_API_URL=http://127.0.0.1:8011` (refuses any
URL other than that dedicated integration host; skipped otherwise). Against the live isolated
`energy_rd_auth_integration_test` DB it: registers a fresh ephemeral account (random UUID email,
random 24-byte password, never logged/printed), confirms an **empty** home list, creates its own
home via the typed client, reads that home's dashboard, rotates the refresh token and confirms
the access token changed, confirms a second independently-registered account gets 404 on the
first account's home (cross-user isolation), logs out and confirms the old access token is
rejected, logs back in, deletes the home it created, and logs out again. `finally` cleans up the
created home and both sessions; no schema reset, no pilot/production DB touched, no other users
affected. **Executed and passed** (`Tests 1 passed`) against the live API provided at
`http://127.0.0.1:8011`.

### Bundle proof

Latest (after the review fixes): `npx expo export --platform ios` (1091 modules) and
`--platform android` (1086 modules) succeeded with no env overrides; export dirs deleted. A
production export without an HTTPS `EXPO_PUBLIC_API_URL` now bundles but renders the
`config-error` screen at runtime (by design).

Earlier pass:

`npx expo export --platform ios|android` succeeded both with
`EXPO_PUBLIC_AUTH_ENABLED=true EXPO_PUBLIC_API_URL=http://127.0.0.1:8011` (auth path) and with
`EXPO_PUBLIC_AUTH_ENABLED=false EXPO_PUBLIC_API_URL=http://127.0.0.1:8000` (legacy path) —
Metro bundled without error in both configurations (~1085–1090 modules). Export output directories
were deleted after inspection; not committed.

## Independent review fixes (Codex) — strict TDD

1. **Identity resurrected in a login/hydration continuation (REQUIRED).** A `logout()` landing
   after the issued pair was written to SecureStore but before `signIn()`/`hydrate()` resumed let
   the stale continuation assign tokens and publish `authenticated` with the previous user after
   the logout boundary (and nothing revoked that issued pair server-side). Fix in
   `session.ts: save(pair, epoch, commit)`: after the storage write it re-checks the epoch and, in
   ONE synchronous block after the last `await`, adopts the tokens and runs `commit` (the identity
   publish), so no boundary can interleave. If stale it wipes **only** the value that save wrote
   (`read() === raw` → `clear()`, serialized in the storage queue, so a newer session's pair is
   never deleted) and throws; the caller's catch best-effort revokes the issued refresh token.
   Tests: logout injected 0–24 microtasks after the write, for login and for hydration: no
   `authenticated` after the boundary, `getAccessToken()` rejects, storage empty, issued refresh
   revoked; plus the case where logout's own SecureStore deletion fails (stale pair still wiped).
2. **Arbitrary server error text on screen (REQUIRED).** The shared `parseErrorBody` copies
   `detail`/`msg` verbatim. New `src/api/errors.ts` (mobile-only, `packages/*` untouched):
   `guardApiErrors()` wraps the whole typed `api` object (`api/client.ts`) and rebuilds every
   `ApiError` from local Spanish text by status (0/400/401/403/404/409/422/429/5xx); field errors
   survive only for an allowlist of API fields, each with a local message (server `msg` dropped);
   `code`/`request_id` kept only if they match known formats. `ContractError` is preserved (still
   never retried); 5xx still retried once. `homes.ts` uses the local `serverError()`; its own
   local messages (validation, ambiguous-create timeout) are marked safe. `describeError()` is the
   only text source for `ErrorState`, form server errors, delete alerts and `CreateHomeForm`; a
   plain `Error.message` or unmarked `ApiError.message` is never rendered. Client-side validation
   (`f-kwh-error`) is unchanged.
3. **HTTPS-only API origin in release (hardening).** `resolveApiUrl(env, hostUri, platform,
   development)` — outside `__DEV__` (or when unknown) only an explicit `https://host[:port]`
   origin is accepted (no http, credentials, path, query, fragment, nor local fallback); otherwise
   `ApiUrlConfigError`. `API_CONFIG` captures it so `App.tsx` renders a `config-error` screen and
   never mounts the navigator or issues a request (`API_URL` falls back to a `.invalid` origin).
   `__DEV__` keeps explicit http URLs, LAN `hostUri`, `10.0.2.2` and `localhost` (Maestro/pilot via
   Metro unaffected).

## Honest limits

- **No Expo Go / simulator / Maestro run was performed.** Unit tests mock React Native and
  SecureStore entirely; the Metro bundle proof confirms the JS graph resolves and bundles, not
  that the screens render or behave correctly on a device. The parent team is exercising the live
  native UI separately — this implementation is not claimed as UI-verified.
- No password recovery, email verification, or account deletion exists server-side; the UI says so
  explicitly rather than faking a flow.
- `AuthScreen`/`CreateHomeForm` were not run through `interface-review`/`better-interface`
  (read-only review skills) in this session — accessibility/layout/writing choices (labels, live
  regions, verb-first buttons, error-next-to-field, 44pt touch targets, token reuse) follow the
  patterns documented in those skills but were not independently reviewed.
- Existing Maestro pilot flow (`maestro/pilot-flow.yaml`) was **not modified**; no auth Maestro
  flow was added in this pass (would need a running Expo Go/simulator session to author and run,
  which is outside this task's scope per the parent's note that they verify native UI separately).
- Session state and React Query cache are process-memory only; killing the app loses in-flight UI
  state (by design — only the SecureStore-held token pair survives restart, and hydration
  immediately rotates/validates it rather than trusting it).
