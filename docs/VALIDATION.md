# Validation — BYOK edition 0.3.0

Checked locally on 2026-10-29, Windows, Node.js 24.19.0.

## Automated checks

- `npm test`: **132/132 passed**, including 87 historical Studio regression cases and 45 current BYOK adapter/catalog/HTTP cases. After the final shared-key invalidation assertion, the HTTP suite passed again.
- `npm run build`: TypeScript and Vite production build.
- `npm run local`: actual build-and-start command verified from the Windows workspace, including its non-ASCII directory path, on a separate local port.
- Current adapter tests exercise SDK request serialization and parsing for five text protocols and ten image protocols: OpenAI-compatible Images, Gemini, OpenRouter, SiliconFlow, MiniMax, GLM/CogView, Seedream, Stability AI, fal.ai and Replicate. These use constructed upstream responses, not paid services.
- HTTP flow tests complete both one-story text and comic jobs through the SDK, preserve their explanation and question stages, enforce an application attempt budget of 24, and exercise pause/retry and cancellation boundaries.
- Key checks cover endpoint changes, settings redaction, browser isolation, no environment-key fallback, no keys in working files or exports, sanitized upstream failures and credential-echo rejection.
- Image checks distinguish output metadata from vision input and model-name guesses. Truncated PNG output is rejected. Removed Imagen SDK support is rejected before a network call.
- The 37-entry registry has unique IDs and implemented protocols. Address checks include Alibaba workspace hosts, Azure resource roots, Gemini full endpoints, local ports and custom proxy prefixes; vendor-lookalike domains do not match.
- Shared configuration tests verify that only the text key is used, models remain independent, cross-host sharing is rejected, changing a shared key invalidates image capability, and unlinking clears the copied key. Environment-key fallback checks include the added SDKs.
- Native image fixtures validate each request body, actual image bytes, credential-free CDN downloads, MiniMax logical errors, and Stability moderation errors. SDK retries remain disabled.

## Browser interaction and rendering

The 0.2.0 baseline passed 38 browser checks plus 3 cancellation checks:

- Entry, API settings, text reader, comic reader, explanation, discussion answers, export and both generation modes.
- Stable page navigation when inner text is scrolled; page turns reset only the reading area's scroll position.
- Viewports of 320, 390, 768, 1024 and 1440 px: no horizontal overflow; page controls remain visible.
- Own-API configuration, model list, declared image output, explicit one-image validation, preview and key-field clearing after save.
- Text generation does not request images; comic generation fills every page through a synthetic local HTTP service.
- Another browser context cannot fetch working stories or media; media use `no-store`.
- Settings cancellation can be clicked while a request is pending, releases the interface and allows closing the dialog. Browser cancellation UI used request interception; server cancellation was independently exercised against an abort-aware test upstream.
- No page exceptions or webfont requests during the main interaction pass. Exported Markdown contains explanation content and no fixture key.

Actual screenshots were visually inspected for the opening workspace, desktop and mobile text/comic readers, and desktop/mobile API settings. The public README screenshot is an opening page with bundled public art; its dimensions, byte count and SHA-256 are recorded in [SOURCES.md](../SOURCES.md). Local QA scripts, logs, exports and extra screenshots remain in the ignored `output/` directory.

For 0.3.0 the updated settings were additionally exercised in the in-app browser at its normal 1280 × 720 viewport and temporary 390 × 844 / 320 × 740 viewports:

- Provider selection fills the corresponding shared address and native image protocol. Only one Key input is shown in shared mode; separate mode exposes both.
- Synthetic SiliconFlow model metadata moves the image indicator from unknown to declared. An explicit fixture image response produces the verified indicator and preview; independent MiniMax image configuration was also exercised.
- Selecting DeepSeek disables sharing and reveals the independent image service. Switching an independent image endpoint into sharing clears its incompatible model ID.
- Azure resource-root input acquires `/openai/v1`; saving, reopening and reloading retain non-secret configuration while keeping saved keys out of responses.
- A browser password-autofill issue was found during the check. Key inputs now use service-specific identities and `new-password` hints; browser inspection confirmed empty, non-autofilled inputs after switching services.
- The settings dialog has no horizontal overflow at 390 and 320 widths. Its contents scroll inside while the Save action stays visible. Desktop text/image model fields were aligned. Temporary viewport overrides were reset after verification.

These UI requests went only to an application instance with an injected synthetic upstream. They were not vendor calls or evidence that a paid account can use a given model. The user's ordinary demo instance uses the normal provider implementation.

## Limits of these checks

No real API credentials were used and no vendor-by-vendor paid call or quota test was performed. A successful synthetic protocol check establishes adapter behavior, not a service account's model access or online reliability. Runtime capability tests are available for users' own configured services.

Image quality, cross-page character consistency, factual accuracy and learning effectiveness are not established by these engineering checks. The app still labels machine review and model-provided references appropriately. The public edition does not provide a bookshelf, persistent cross-restart recovery or multi-tenant hosting.

Earlier Studio production deployment records describe the archived full edition, not this local BYOK app.
