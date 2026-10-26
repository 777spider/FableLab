# Public preview validation

Initial preview checked locally on 2026-10-26 with Node.js 24.19.0 and npm 11.17.0. The bookshelf and optional long-text updates below were checked on 2026-10-27.

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
