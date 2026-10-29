# Security policy

Security fixes target the current default branch. This edition is a personal, loopback-only application using API credentials supplied by its user. No author API credentials or paid quota are bundled.

Please use GitHub private vulnerability reporting if available. Never put credentials, cookies, private prompts, generated user material or exploit details in a public issue. If a private reporting route is unavailable, ask for a confidential contact route without including the vulnerability details. Reproduce only on systems you control and use synthetic content.

API keys stay in process memory, are not returned by settings reads, and are not intentionally written to job checkpoints, exports or application logs. A browser isolation cookie scopes local configurations and media. A changed service URL or protocol does not silently inherit the previous key. Provider redirects are rejected, and image downloads on other origins strip provider credentials.

Working content uses temporary storage, removed on graceful shutdown. Forced termination may leave temporary story/image data behind. User API requests are sent to the configured service and subject to that service's policies. Do not expose the local service as a public proxy; it is not a hardened multi-tenant gateway. See [operation boundaries](docs/DEPLOYMENT.md).

Legacy authentication and sharing modules are retained for regression/history but are not mounted by the default BYOK entry point. Reports should name the entry point and affected version.
