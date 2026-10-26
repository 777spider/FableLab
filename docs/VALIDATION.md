# Public preview validation

Checked locally on 2026-10-26 with Node.js 24.19.0 and npm 11.17.0. Application source corresponds to commit `407d5d2f303dfaec624e4ed4da9edcc2f65aacca`; subsequent publication updates change documentation only.

| Check | Result |
| --- | --- |
| Clean installation | `npm ci` passed with dependencies from the official npm registry. |
| Automated tests | `npm test`: 53 passed, 0 failed. |
| Production build | `npm run build`: TypeScript and Vite passed. |
| Runtime dependency audit | `npm audit --omit=dev --registry=https://registry.npmjs.org`: 0 reported vulnerabilities at the time of checking. |
| Synthetic end-to-end flow | Registration, single-story text generation, comic placeholders, private ownership, account recovery, sharing and revocation passed. Sessions, bookshelf records and media survived a service restart. |
| Browser review | Desktop 1440 × 1000 and mobile 390 × 844: the home, preset comic and generated discussion pages rendered; no application page errors or horizontal overflow were observed. |
| Release hygiene | Reviewed the complete staged snapshot for credentials and private data. No production database, logs, browser state, real learner records or credentials are included. |

The end-to-end checks used a fresh temporary data directory with real model access disabled and server-side network access blocked. They do **not** establish current ECNU service availability or the accuracy of AI-generated teaching materials. The mock comic uses placeholder images; the bundled preset uses cached artwork.

## Hosted CI status

The [GitHub Actions workflow](../.github/workflows/ci.yml) installs dependencies, runs the tests and builds the app. On 2026-10-26, [hosted run 40322549786, attempt 2](https://github.com/bigWhiteTofu/FableLab/actions/runs/40322549786/attempts/2) passed installation, tests and the production build for commit `d7f4cb11ba3260578b5946db979d08882934f861`, the `v0.1.0` release commit. The earlier execution restriction was resolved; no application-code change was needed. The README badge shows the current `main` workflow status.

Reproduce the code checks with:

```sh
npm ci
npm test
npm run build
```

For the isolated local demo, follow [QUICKSTART.md](QUICKSTART.md). Production deployment still requires its own credentials, settings and acceptance checks.
