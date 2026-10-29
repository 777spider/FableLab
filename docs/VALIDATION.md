# Validation — BYOK edition 0.2.0

Checked locally on 2026-10-29, Windows, Node.js 24.19.0.

## Automated checks

- `npm test`: **106/106 passed**, including 87 historical Studio regression cases and 19 current BYOK adapter/HTTP cases.
- `npm run build`: TypeScript and Vite production build.
- `npm run local`: actual build-and-start command verified from the Windows workspace, including its non-ASCII directory path, on a separate local port.
- Current adapter tests exercise SDK request serialization and parsing for Chat Completions, Responses, Anthropic, Gemini, OpenRouter, OpenAI-compatible Images, Gemini images and OpenRouter Images. These use constructed upstream responses, not paid services.
- HTTP flow tests complete both one-story text and comic jobs through the SDK, preserve their explanation and question stages, enforce an application attempt budget of 24, and exercise pause/retry and cancellation boundaries.
- Key checks cover endpoint changes, settings redaction, browser isolation, no environment-key fallback, no keys in working files or exports, sanitized upstream failures and credential-echo rejection.
- Image checks distinguish output metadata from vision input and model-name guesses. Truncated PNG output is rejected. Removed Imagen SDK support is rejected before a network call.

## Browser interaction and rendering

38 browser checks passed, followed by 3 checks for the added cancellation interaction:

- Entry, API settings, text reader, comic reader, explanation, discussion answers, export and both generation modes.
- Stable page navigation when inner text is scrolled; page turns reset only the reading area's scroll position.
- Viewports of 320, 390, 768, 1024 and 1440 px: no horizontal overflow; page controls remain visible.
- Own-API configuration, model list, declared image output, explicit one-image validation, preview and key-field clearing after save.
- Text generation does not request images; comic generation fills every page through a synthetic local HTTP service.
- Another browser context cannot fetch working stories or media; media use `no-store`.
- Settings cancellation can be clicked while a request is pending, releases the interface and allows closing the dialog. Browser cancellation UI used request interception; server cancellation was independently exercised against an abort-aware test upstream.
- No page exceptions or webfont requests during the main interaction pass. Exported Markdown contains explanation content and no fixture key.

Actual screenshots were visually inspected for the opening workspace, desktop and mobile text/comic readers, and desktop/mobile API settings. The public README screenshot is an opening page with bundled public art; its dimensions, byte count and SHA-256 are recorded in [SOURCES.md](../SOURCES.md). Local QA scripts, logs, exports and extra screenshots remain in the ignored `output/` directory.

## Limits of these checks

No real API credentials were used and no vendor-by-vendor paid call or quota test was performed. A successful synthetic protocol check establishes adapter behavior, not a service account's model access or online reliability. Runtime capability tests are available for users' own configured services.

Image quality, cross-page character consistency, factual accuracy and learning effectiveness are not established by these engineering checks. The app still labels machine review and model-provided references appropriately. The public edition does not provide a bookshelf, persistent cross-restart recovery or multi-tenant hosting.

Earlier Studio production deployment records describe the archived full edition, not this local BYOK app.
