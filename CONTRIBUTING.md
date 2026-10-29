# Contributing

Small, focused contributions are welcome. Explain the user need before a substantial feature or model integration.

Use Node.js 24+. Run `npm ci`, `npm test`, and `npm run build`. `npm run local` builds and starts the personal BYOK edition; the built-in reader example requires no credentials.

Preserve its two modes, text and comics, and the read–explain–discuss flow. Do not add default accounts, a persistent bookshelf, a shared author key, or hidden paid capability probes. Use explicit protocol adapters, preserve unknown capability states, and distinguish image output from vision input.

Keep tests independent of real accounts and paid services. Provider tests should exercise real SDK request/response paths with synthetic upstream responses. Cover endpoint/key changes, error sanitization, browser isolation, and generated media access. Historical full-Studio regression tests remain; the default runtime does not mount those APIs.

Never contribute credentials, private content, logs, local machine paths, or screenshots with keys. Check staged files even when ignored locations exclude common sensitive files. Follow [SECURITY.md](SECURITY.md) for vulnerabilities.

Application contributions use the [MIT License](LICENSE). Preserve third-party notices and asset licenses.
