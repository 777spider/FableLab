# Contributing

Small, focused contributions are welcome. Explain the user need in an issue before starting a substantial feature or a new model integration.

Use Node.js 24 or newer. Install with `npm ci`, run `npm test`, and check `npm run build`. See [the synthetic quickstart](docs/QUICKSTART.md) for a local demo without a model key or network generation.

Preserve the read–explain–discuss flow, ownership checks for private content, revocable sharing, and resumable jobs. Keep tests independent of real accounts, model services, production settings, and paid requests. New provider work should implement the existing `GenerationProvider` boundary and include synthetic or mocked tests.

Do not contribute credentials, cookies, recovery codes, private learning content, server logs, local paths, or production screenshots. Check staged files even when `.gitignore` excludes the usual sensitive locations. Use [the security policy](SECURITY.md) for vulnerabilities.

By submitting a contribution, you agree to make it available under this project's [MIT License](LICENSE). Keep the required license and copyright information when adding third-party code or assets.
