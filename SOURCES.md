# Sources and showcase provenance

Checked on 2026-10-26. These notes document inspiration and the README illustration; they do not establish educational effectiveness or endorsement.

## Original inspiration

- **Publisher's episode page:** [Newcomer, 20 April 2026](https://podcast.newcomer.co/video/amanda-askell-on-ai-consciousness-claude-silicon-valleys-biggest-fear). Its official chapter list places the parable discussion at **52:47**.
- **Original interview:** [Newcomer's official YouTube video, 53:42](https://www.youtube.com/watch?v=0GaKJ4Fp2x4&t=3222s). Its English automatic captions were inspected at **53:42–54:10**: Askell describes an indirect parable for a graduate-level concept, with a delayed reveal and an explanation afterward. The README uses a paraphrase.
- **Affiliation:** [Anthropic's official constitution page, acknowledgements](https://www.anthropic.com/constitution#acknowledgements) identifies Amanda Askell as the leader of its Character work and the constitution's primary author. This verifies her role; it does not connect Anthropic to FableLab.

### Attribution boundaries

At **54:38**, host Eric Newcomer makes the broader comment about storytelling; it is not Askell's statement. The passage describes a delayed reveal, not a universal prohibition on naming the concept. Neither is used as evidence of learning gains.

Secondary pages helped locate the episode but are not the authority for the README's attribution: [Toolin](https://toolin.ai/en/blog/fable-prompt-learn-concepts) and [concept-fable](https://github.com/hawkongz/concept-fable). Their expanded templates and claims were not copied into FableLab's README.

## Historical Studio illustration

| Item | Provenance |
| --- | --- |
| File | `docs/assets/fablelab-comic.webp` |
| Source | [Public, anonymous preset reader](https://yuyan.aiecnu.site/learn?demo=1&mode=comic), captured on 2026-10-26 |
| Capture | Unaltered 1440 × 1020 browser viewport; WebP, 293,848 bytes |
| SHA-256 | `bb5085a9fcb0cc8cfe4b568051dbc1fec3c5ddad4cc5e3847977255f6e3d723d` |
| Scope | Public preset text and this project's AI-assisted illustration, with redistribution authorized by the project owner; no private account, bookshelf, generated user material, or institutional logo |
| Interpretation | A built-in example, not evidence of a fresh model call. The pictured preset retains two stories; new tasks generate one. Mock generation uses fixed text and tiny placeholder images. |

The project's bundled illustrations have their separate inventory in [docs/ASSETS.md](docs/ASSETS.md).

## Technical claims

The original Studio sources remain for history and regression tests. For the current BYOK entry point see [server/index.ts](server/index.ts), [server/lite-app.ts](server/lite-app.ts), and [server/byok.ts](server/byok.ts). The default app does not mount the account or sharing modules. The repository is the primary source for implementation claims: [package.json](package.json) for the runtime and frontend, [server/generation.ts](server/generation.ts) for validation and provider contracts, [server/jobs.ts](server/jobs.ts) for generation checkpoints, [server/auth.ts](server/auth.ts) for accounts, and [server/share.ts](server/share.ts) for snapshots. The [local guide](docs/QUICKSTART.md), [model service guide](docs/MODEL_SERVICE.md), and [deployment guide](docs/DEPLOYMENT.md) describe the supported setup and boundaries. No benchmark or educational-effect claim is made.

## Current BYOK edition and README screenshot

Checked against installed packages on 2026-10-29:

- [Vercel AI SDK](https://github.com/vercel/ai): `ai` 7.0.156 and direct providers, Apache-2.0. No default AI Gateway or author API credentials are used.
- [OpenRouter official AI SDK provider](https://github.com/OpenRouterTeam/ai-sdk-provider): 3.1.0, Apache-2.0, as declared in the installed package and its license. It provides chat and a dedicated Images adapter.
- [AI SDK protocol documentation](https://ai-sdk.dev/providers/openai-compatible-providers), [Google provider](https://ai-sdk.dev/providers/ai-sdk-providers/google), and [OpenRouter image API](https://openrouter.ai/docs/guides/overview/multimodal/image-generation) informed adapter selection. The installed Google SDK currently rejects non-Gemini image models; the UI does not advertise Imagen support.
- Local [Taste Skill](https://github.com/Leonxlnx/taste-skill) guidance informed spacing, hierarchy, restrained color and interface detail. The UI is implemented in this repository; no third-party application screen was copied.

`docs/assets/fablelab-byok.png` is an unaltered 1440 × 1000 browser screenshot of the current public edition's opening workspace, captured locally on 2026-10-29. It contains the project's bundled public illustration and no private story, API key, account or research data. Size: 414,327 bytes. SHA-256: `06252af5aaf675019f4801431fbf59cea4147b3af15fb5cc102220d7273866f5`.

The screenshot illustrates the interface, not live model quality. API validation used synthetic local upstreams and no paid credentials. The research-group link was supplied by the project owner: [aiecnu.site](https://aiecnu.site). It appears near the top of both README languages.
