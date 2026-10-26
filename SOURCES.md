# Sources and showcase provenance

Checked on 2026-10-26. These notes document inspiration and the README illustration; they do not establish educational effectiveness or endorsement.

## Original inspiration

- **Publisher's episode page:** [Newcomer, 20 April 2026](https://podcast.newcomer.co/video/amanda-askell-on-ai-consciousness-claude-silicon-valleys-biggest-fear). Its official chapter list places the parable discussion at **52:47**.
- **Original interview:** [Newcomer's official YouTube video, 53:42](https://www.youtube.com/watch?v=0GaKJ4Fp2x4&t=3222s). Its English automatic captions were inspected at **53:42–54:10**: Askell describes an indirect parable for a graduate-level concept, with a delayed reveal and an explanation afterward. The README uses a paraphrase.
- **Affiliation:** [Anthropic's official constitution page, acknowledgements](https://www.anthropic.com/constitution#acknowledgements) identifies Amanda Askell as the leader of its Character work and the constitution's primary author. This verifies her role; it does not connect Anthropic to FableLab.

### Attribution boundaries

At **54:38**, host Eric Newcomer makes the broader comment about storytelling; it is not Askell's statement. The passage describes a delayed reveal, not a universal prohibition on naming the concept. Neither is used as evidence of learning gains.

Secondary pages helped locate the episode but are not the authority for the README's attribution: [Toolin](https://toolin.ai/en/blog/fable-prompt-learn-concepts) and [concept-fable](https://github.com/hawkongz/concept-fable). Their expanded templates and claims were not copied into FableLab's README.

## README image

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

The repository is the primary source for implementation claims: [package.json](package.json) for the runtime and frontend, [server/generation.ts](server/generation.ts) for validation and provider contracts, [server/jobs.ts](server/jobs.ts) for generation checkpoints, [server/auth.ts](server/auth.ts) for accounts, and [server/share.ts](server/share.ts) for snapshots. The [local guide](docs/QUICKSTART.md), [model service guide](docs/MODEL_SERVICE.md), and [deployment guide](docs/DEPLOYMENT.md) describe the supported setup and boundaries. No benchmark or educational-effect claim is made.
