# Public preview validation

Initial preview checked locally on 2026-10-26 with Node.js 24.19.0 and npm 11.17.0. The bookshelf and optional long-text updates below were checked on 2026-10-27.

## Deployed covers and faster bookshelf: 2026-10-28

The independent live service now serves the new cover art, complete native fonts and a lightweight authenticated library endpoint. The public checkout passed **87 tests** and its build. The deployed Studio candidate passed **85 tests** and builds locally and on Linux, with 26 deployment simulations and the package-order check passing on Linux without skips. All 301 application files were checked against the frozen package, and the 126 frontend files were downloaded and compared byte for byte before switching the service.

The hosted build passed **40 browser checks** without application errors. Real anonymous checks covered the lightweight endpoint's 401/no-store boundary, both built-in cases, zero font downloads, explanation/discussion, comic artwork and mobile overflow. Isolated GET mocks covered all cover styles, private book reading, Back/focus, reduced motion, cached navigation before the background response and account mismatch cleanup. Warm mocked shelf navigation took 55–62ms; this is not an authenticated production loading benchmark. No production accounts, stories or model requests were created for these tests. See [bookshelf performance](SHELF_PERFORMANCE.md).

Post-deployment checks verified the installed source/process, unchanged saved job bytes and account/session/share records, and unchanged fingerprints for 28 protected databases, 10 legacy HTTP paths and unrelated services/configuration. The checks below describe earlier checkpoints; their then-pending deployment statements are historical.

## Literary cover art: 2026-10-28

The public checkout passed all **86 tests** and `npm run build`; Studio passed all 84 tests and its build. The four cover-related source files match across the checkouts. No dependencies or bundled font files changed.

The actual local production build passed **27 browser checks** at 1440, 768, 390 and 320px. All four paper palettes and three original SVG compositions were inspected in screenshots. Text/paper contrast was 9.41–10.21:1; opening excerpts fit above the date at 14px or larger, titles appeared below the covers, and comic artwork remained intact. Refresh/input reordering preserved each cover's identity. Opening, eight-page reading, Back focus, reduced motion, keyboard skip-link visibility, narrow navigation and zero font downloads passed without application errors. Three private stories were explicitly synthetic fixtures in isolated browser GET mocks; both built-in cases and comic art were real bundled assets. There were no model calls or production writes. See the [actual preview and design sources](COVER_DESIGN.md).

This art revision is newer than the earlier frozen deployment candidate. It has not been deployed to the live example.

## Typography, shelf and durable recovery: 2026-10-28

The public checkout passed **86 tests**, zero failures or skips, and `npm run build`. The production configuration, portable launcher, dependency lock, fetch-compatible Windows HTTP ports, presets and public artwork remain intact. This source revision has not been deployed to the live example: the fresh independent-service SSH preflight failed before staging or switching anything.

The matching Studio build passed 84 tests and 26 browser assertions on desktop1440×1000 and mobile390×844. Actual local anonymous checks exercised both bundled cases, native paragraph font rendering, explanation/discussion, comic artwork and zero font network requests. Isolated browser mocks exercised creation-time shelf ordering, escaped opening excerpts, cover sizing, book opening/Back/reduced motion, initial-read and polling reconnect, close/reopen restoration, explicit pause, scheduled backoff, one idempotent sixteen-page creation, empty/demo offline recovery and account-switch cache isolation. Private UI and failures were mocked; they are not production account/generation acceptance. The complete native font observed on the Windows test host was Microsoft YaHei; no fonts were downloaded or redistributed.

Synthetic clock/provider tests cover bounded delays and call budgets, persisted due times across restart, one worker, explicit pause, image checkpoints/references and successful academic recovery followed by image failure/restart without repeated review. A real localhost HTTP test logs out while a synthetic story stage is blocked, then confirms the server completes without polling and a fresh login retrieves the same task. Existing validation and one automatic candidate repair remain in place. See [recovery boundaries](RECOVERY.md).

Production accounts, jobs, learning records and model services were not used for testing. No server restart or outage was induced on the hosted service, and the new runtime has not been accepted there.

| Check | Result |
| --- | --- |
| Clean installation | `npm ci` passed with dependencies from the official npm registry. |
| Automated tests | `npm test`: 68 passed, 0 failed (2026-10-27); the earlier bookshelf baseline had 55. |
| Production build | `npm run build`: TypeScript and Vite passed. |
| Runtime dependency audit | `npm audit --omit=dev --registry=https://registry.npmjs.org`: 0 reported vulnerabilities at the time of checking. |
| Synthetic end-to-end flow | Registration, single-story text generation, comic placeholders, private ownership, account recovery, sharing and revocation passed. Sessions, bookshelf records and media survived a service restart. |
| Browser review | Desktop 1440 × 1000 and mobile 390 × 844: the home, preset comic and generated discussion pages rendered; no application page errors or horizontal overflow were observed. |
| Release hygiene | Reviewed the complete staged snapshot for credentials and private data. No production database, logs, browser state, real learner records or credentials are included. |

The end-to-end checks used a fresh temporary data directory with real model access disabled and server-side network access blocked. They do **not** establish current ECNU service availability or the accuracy of AI-generated teaching materials. The mock comic uses placeholder images; the bundled preset uses cached artwork.

## Bookshelf update — 2026-10-27

The two built-in cases remain visible during loading and errors and are not inserted into account data. Tests check stable preset links, the education case's seven-page paragraph coverage and its quotation anchors. Mock browser reviews checked Enter, modified clicks and new tabs, duplicate clicks, Back, reduced motion, animation fallbacks and 390 px overflow. The revised opening uses a 170 ms lift/cover turn followed by a 330 ms native View Transition into the reader, with same-page fallback. Its real paired snapshot readiness, URL-only history, focus, lower-row opening, return scroll restoration and private-job revalidation failure were checked. Cover dates occur once, and valid 40-character Chinese/English titles fit at 14 px or larger after font loading and resize. No API writes or model calls were made. Actual browser Back was checked; persisted lifecycle resets were simulated rather than claimed as a real bfcache hit.

## Optional long text, reading font and cover dates — 2026-10-27

The public checkout passed all **68 tests** and `npm run build` with prompt version `studio-staged-v1.2.3`. This includes the existing 55 checks, 12 long-text regressions and the font-asset check. The public production-configuration checks and its Windows-compatible HTTP test port allocation remain in place. The build reports the existing Radix `use client` directive warnings and completes successfully.

Long-text tests use SyntheticProvider or injected fetch mocks and temporary data directories. They check 8/16 scene acceptance, 6/7/17 rejection, 2400–8000 character bounds, scene-to-paragraph normalization, the reproduced duplicate-reference failure, teaching-page title rejection without substring false positives, same-job repair, restart and pause checkpoints, unchanged attempt budgets, idempotency conflicts, comic rejection and image-free frozen shares. Standard text, comics, both fixed cases and legacy two-story records continue to pass.

The font check verifies all 97 WOFF2 signatures, byte counts, SHA-256 names, local CSS references, Unicode ranges and original license files. HTTP tests restrict immutable caching to the named font version's hashed WOFF2 files and the existing hashed public art. The cover-date and font changes are included in the production build; this entry does not add a new browser-review claim.

A separate isolated local ECNU integration run completed the generation and saving path with a 3700-character, 11-page story: knowledge, story, explanation, two questions, two discussion prompts and machine review, using four text requests and no image requests. That process started before the final scene-title guard was added; the guard has separate synthetic coverage, and manual reading found no teaching-page titles in those 11 scenes. Manual review did find an arithmetic inconsistency, so this is a technical integration result, not expert acceptance of the teaching content. The sample is not bundled as a curated preset; no runtime records, original prose, user data or credentials were copied into the public checkout. See [writing design and content boundaries](WRITING_DESIGN.md).

## Hosted CI status

The [GitHub Actions workflow](../.github/workflows/ci.yml) installs dependencies, runs the tests and builds the app. On 2026-10-26, [hosted run 40322549786, attempt 2](https://github.com/777spider/FableLab/actions/runs/40322549786/attempts/2) passed installation, tests and the production build for commit `d7f4cb11ba3260578b5946db979d08882934f861`, the `v0.1.0` release commit. The earlier execution restriction was resolved; no application-code change was needed. The README badge shows the current `main` workflow status.

Reproduce the code checks with:

```sh
npm ci
npm test
npm run build
```

For the isolated local demo, follow [QUICKSTART.md](QUICKSTART.md). Production deployment still requires its own credentials, settings and acceptance checks.
