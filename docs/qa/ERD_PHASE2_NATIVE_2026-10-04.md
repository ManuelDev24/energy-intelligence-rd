# Phase 2 native QA — 2026-10-04

## Outcome

**The final strengthened Phase 2 Maestro flow passed twice consecutively on each native platform against the isolated authenticated API `http://127.0.0.1:8011`.** Native screenshots were inspected, including the visible iOS decimal keyboard and its reachable **Listo** control. This is simulator/emulator verification through Expo Go, not physical-device certification or a claim of zero flakiness.

| Exact command, from repository root | Exit | Full flows | Completed assertion/wait commands | Duration |
|---|---:|---:|---:|---|
| `python3 apps/mobile/scripts/run-native-phase2-qa.py ios ios-run12-final` | 0 | 1/1 | 28 | 1m 40s |
| `python3 apps/mobile/scripts/run-native-phase2-qa.py ios ios-run13-repeat-final` | 0 | 1/1 | 28 | 1m 40s |
| `python3 apps/mobile/scripts/run-native-phase2-qa.py android android-run9-final` | 0 | 1/1 | 28 | 4m 16s |
| `python3 apps/mobile/scripts/run-native-phase2-qa.py android android-run10-repeat-final` | 0 | 1/1 | 28 | 3m 27s |

Each run contains **13 direct assertions + 15 timed assertion/waits** (including launch/auth readiness and deletion verification), not 28 independent business test cases. Final four runs: **4/4 full flows, 112 completed assertion/wait commands**. Counts were parsed from Maestro `commands.json`, and JUnit records one passing testcase per run. Android has four expected optional `keyboard-done` tap warnings because that control exists only on iOS; no assertion was skipped or warned. iOS final runs have no warnings. Conditional platform/developer-menu branches are skipped normally.

Covered: disposable registration → owned home → monthly RD$3,000/300 kWh goal → insufficient-data state and CTAs → negative-reading validation → valid Oct 1 08:00 / Oct 3 20:00 readings → 30-day consumption with quality/gaps → range/granularity changes → expanded 12-month details → October goal progress/projection → confirmed deletion of the second reading and verification that its row disappears.

## Narrow application fix and regression evidence

`apps/mobile/src/features/auth/AuthScreen.tsx`: changed the iOS `textContentType` from registration `newPassword` to `password`, retaining `secureTextEntry` and the existing autocomplete policy. On this iOS 27 / Expo Go setup, `newPassword` produced a blank input-view area and failed registration; a focused native probe surfaced the password-length validation message rather than reaching owned homes.

The hypothesis was tested by restoring the original content-type after a passing fixed run, clearing/restarting only the owned iOS Metro, and rerunning the same updated full flow: `ios-run6-old-content-type` failed at `auth-add-home` (exit 1). Restoring `password` allowed registration and the full native flow to pass again. This is a real native RED/GREEN regression; pure-logic Vitest does not render UIKit secure inputs, so no misleading mocked unit test was added for this OS behavior.

No Phase 2 chart/goal computation or API contract was changed.

## Maestro corrections and evidence review

The original flow needed native automation fixes, not broad application rewrites:

- Android: dismiss the keyboard before saving home/goal/readings; retain the optional iOS-only dismissal control.
- iOS: dismiss the home-name keyboard via its optional native `return` key. Do not unconditionally call `hideKeyboard` when the headless simulator exposes no dismissable keyboard.
- Reruns: sign out the previous disposable authenticated session, including the confirmation dialog. Wait for registration mode explicitly.
- Expo Go cold startup: wait for animation and reopen the isolated Expo URL if still on its Development servers page.
- Reading saves: wait for keyboard/layout animation and center the save control before tapping.
- **Visual evidence caught a false-positive:** earlier iOS `p2-03-consumo-12m` screenshots showed **Facturas**, although the old flow reported success. The detail toggle was at the bottom/tab-bar edge. The final flow centers it, asserts `Ocultar detalle por período` plus the first monthly bucket, captures the actual expanded chart/details, and then collapses them. Earlier 22-assertion passes are not treated as final acceptance.
- Wait for the actual Consumption screen after tab changes, before navigating to readings. This also prevents later cleanup from continuing on an unintended screen.

Final reviewed screenshots show: visible negative input and keyboards; insufficient-data reasons and both CTAs; 30.50 kWh total / 12.20 kWh/day with ESTIMADO labels and explicit no-data gaps; 12-month monthly chart and expanded empty buckets; goal En riesgo, 30.50/300 kWh, projected 378.20 kWh, RD$226.63 actual estimate / RD$3,205.59 projected, and the SIE-121-2026-TF caption. These values were observed from the real isolated API/UI, not synthesized. No actionable clipping/overlap defect remained in the reviewed final Phase 2 surfaces; the iOS reading CTA wraps to two lines without clipping. Expo Go's floating tools button is development chrome.

## Exact evidence paths

Prefix for all entries below:

`/Users/macbookpro/Desktop/energy-intelligence-rd/apps/mobile/maestro/evidence/phase2-2026-10-04/`

Visually reviewed final complete screenshot sets:

- iOS: `ios-run12-final/2026-10-04_152207/phase2-flow/takeScreenshot/evidence/`
- Android: `android-run9-final/2026-10-04_152402/phase2-flow/takeScreenshot/evidence/`

Each directory contains these five actual screenshots:

1. `p2-00-reading-keyboard.png`
2. `p2-01-meta-sin-datos.png`
3. `p2-02-consumo-30d.png`
4. `p2-03-consumo-12m.png`
5. `p2-04-meta-progreso.png`

The iOS keyboard screenshot visibly places **Listo** immediately above the software decimal keyboard (around y=790–858 in the displayed 603×1311 downscaled image), not behind it. The save action is checked only after dismissal/layout settling.

Repeat screenshots (same five filenames):

- `ios-run13-repeat-final/2026-10-04_152852/phase2-flow/takeScreenshot/evidence/`
- `android-run10-repeat-final/2026-10-04_153045/phase2-flow/takeScreenshot/evidence/`

Contact sheets inspected with the vision tool:

- `ios-run12-final/visual-contact-sheet.png`
- `android-run9-final/visual-contact-sheet.png`

Each run directory retains `junit.xml`, redacted `console.log`, timestamped `phase2-flow/commands.json`, and its Maestro artifacts. Aggregated counts/history: `qa-summary.json`. Failure screenshots containing account identifiers were masked in their credential-bearing rectangles; final Phase 2 screenshots are unmodified native captures. Disposable credentials are generated inside the subprocess wrapper and never printed; Maestro text artifacts are redacted after execution. Do not inspect live debug files while a run is in progress.

## Tooling, exact setup commands, and isolation

Repository: `/Users/macbookpro/Desktop/energy-intelligence-rd`, existing branch `Dev`; extensive unrelated work was already present and left intact. Maestro found at `/opt/homebrew/bin/maestro`, version **2.11.0** (`~/.maestro/bin/maestro` did not exist). No install was performed.

Targets:

- iPhone 18 Pro, **iOS 27.0**, `6A93B4DE-A287-4048-9A75-D16849180A25`, Expo Go `host.exp.Exponent` (already booted/installed).
- EnergyRD_Pixel, **Android 16**, `emulator-5554`, Expo Go `host.exp.exponent` (already installed in the AVD; emulator started for this QA).

Xcode discovery yielded `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`; this made `xcrun simctl` available. Conventional Simulator.app paths were absent in this Xcode installation, and the optional desktop computer-use backend was unavailable; neither blocked native Maestro/simctl verification.

From `apps/mobile`, the owned iOS Metro was started/restarted as:

```bash
eval "$(fnm env --shell bash)"
NODE_OPTIONS=--dns-result-order=ipv4first EXPO_PUBLIC_AUTH_ENABLED=true EXPO_PUBLIC_API_URL=http://127.0.0.1:8011 DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer CI=1 fnm exec --using=24 npx expo start --localhost --port 8083 --clear
```

The owned Android Metro used the same exact command with `--port 8084`. Both startup commands ran as long-lived background processes; readiness was separately verified by `curl -s http://127.0.0.1:8083/status` and `curl -s http://127.0.0.1:8084/status`, each returning `packager-status:running` with exit 0. Initial startup without `NODE_OPTIONS` bound only `[::1]`, causing the first iOS connection failure; IPv4-first fixed it. Metro produced native bundles of 1,234 iOS / 1,232 Android modules on final startup.

Android commands (exit 0):

```bash
/Users/macbookpro/Library/Android/sdk/emulator/emulator -avd EnergyRD_Pixel -no-snapshot-load -no-boot-anim
/Users/macbookpro/Library/Android/sdk/platform-tools/adb -s emulator-5554 reverse tcp:8084 tcp:8084
/Users/macbookpro/Library/Android/sdk/platform-tools/adb -s emulator-5554 reverse tcp:8011 tcp:8011
/Users/macbookpro/Library/Android/sdk/platform-tools/adb -s emulator-5554 shell settings put secure stylus_handwriting_enabled 0
```

The emulator command remained running (background start accepted; not a terminated test command). `run-native-phase2-qa.py` invokes `/opt/homebrew/bin/maestro --device <exact target above> test --no-ansi --test-output-dir <run directory> --debug-output <run directory>/debug --format JUNIT --output <run directory>/junit.xml -e APP_ID=<platform Expo Go ID> -e EXPO_URL=exp://127.0.0.1:<8083 or 8084> -e EMAIL=<subprocess-generated value> -e PASSWORD=<subprocess-generated value> <absolute apps/mobile/maestro/phase2-flow.yaml>`. Credential values are intentionally omitted; exact executable/flags are in the wrapper.

## Failed/intermediate attempts (not hidden)

All commands use `python3 apps/mobile/scripts/run-native-phase2-qa.py <platform> <run name>`. A failed entry exited **1**; a passed intermediate entry exited **0**. All artifacts were retained.

| Run | Result / observed failure |
|---|---|
| ios-run1 | Fail: could not connect to IPv4 Metro; startup assertion |
| ios-run2 / ios-run3 | Fail: registration did not reach `auth-add-home` with original `newPassword` |
| ios-run4 | Fail: unconditional iOS `hideKeyboard` could not dismiss an absent keyboard |
| ios-run5 | Intermediate pass, 22 checks |
| ios-run6-old-content-type | Intentional regression replay, fail at `auth-add-home` |
| ios-run7-final | Fail: home-create tap was obscured by software keyboard |
| ios-run8-final / ios-run9-repeat | Intermediate passes, 22 checks; 12-month screenshot false-positive found during visual review |
| ios-run10-evidence-guard | Fail: negative-reading assertion; navigation was already on home selection after rapid keyboard/layout actions |
| ios-run11-evidence-guard | Intermediate pass, 25 checks; actual expanded 12-month screenshot verified |
| android-run1 | Fail: keyboard obscured `auth-home-create` |
| android-run2 | Fail: logout confirmation not yet handled |
| android-run3 | Intermediate pass, 22 checks |
| android-run4-final | Fail: stayed on Expo Go Home instead of opening isolated bundle |
| android-run5-final / android-run6-repeat | Intermediate passes, 22 checks |
| android-run7-evidence-guard | Fail: login mode instead of registration; registration-mode guard added |
| android-run8-evidence-guard | Fail: cleanup could not find `open-readings`; hierarchy showed goal form, not Consumption |

Two additional focused iOS auth probe YAMLs under Hermes scratch also exited 1 before the compatibility fix. Final runs were repeated after strengthening the assertions; the earlier failures demonstrate why a single passing run is insufficient, not proof that all timing hazards are eliminated.

## Regression checks and final cleanup

From repository root, under Node 24:

```bash
eval "$(fnm env --shell bash)"
fnm exec --using=24 npm test --workspace apps/mobile
fnm exec --using=24 npm run typecheck --workspace apps/mobile
```

Both checks returned clean output, exit **0**: **245 tests passed, 11 skipped**, 21 files passed / 3 skipped; TypeScript reported no errors. Tests were rerun after the final application change. Shared/web/API checks were intentionally not rerun or modified by this workspace-scoped worker.

Only the owned Metro processes on **8083/8084** were stopped. The Android emulator was handed to the parent agent as `proc_b9d3238814f6` so delegation cleanup will not stop it; iOS remained booted. Final readback: isolated API health `healthy/database ok`; pilot Metro `:8081` still `packager-status:running`. Pilot `:8000` was not modified, migrated, or used for writes. Existing flow cleanup deleted only the second reading on each disposable isolated account. Other disposable users/homes/goals/first readings remain intentionally; no additional deletion endpoint was used.

`pilot-flow.yaml` SHA-256 before and after is identical:

`a7141ac6c65e154e84119aa6cd4e2604185cbf2cb5786909b90062e8453f1126`

Files changed by this worker: `apps/mobile/src/features/auth/AuthScreen.tsx`, `apps/mobile/maestro/phase2-flow.yaml`, new `apps/mobile/scripts/run-native-phase2-qa.py`, `apps/mobile/PHASE2_UI.md`, native evidence under `apps/mobile/maestro/evidence/phase2-2026-10-04/`, and this explicitly requested report. No dependency/lockfile/package/API/web/pilot-flow/.next changes, commits, pushes, gateway changes, simulator shutdowns, or export-directory deletion were performed.
