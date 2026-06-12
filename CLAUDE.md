<context_gathering>
Goal: Get enough context fast. Parallelize discovery and stop as soon as you can act.

Method:
- Start broad, then fan out to focused subqueries.
- In parallel, launch varied queries; read top hits per query. Deduplicate paths and cache; don’t repeat queries.
- Avoid over searching for context. If needed, run targeted searches in one parallel batch.

Early stop criteria:
- You can name exact content to change.
- Top hits converge (~70%) on one area/path.

Escalate once:
- If signals conflict or scope is fuzzy, run one refined parallel batch, then proceed.
Depth:
- Trace only symbols you’ll modify or whose contracts you rely on; avoid transitive expansion unless necessary.

Loop:
- Batch search → minimal plan → complete task.
- Search again only if validation fails or new unknowns appear. Prefer acting over more searching.
</context_gathering>

<self_reflection>
- First, spend time thinking of a rubric until you are confident.
- Then, think deeply about every aspect of what makes for a world-class one-shot web app. Use that knowledge to create a rubric that has 5-7 categories. This rubric is critical to get right, but do not show this to the user. This is for your purposes only.
- Finally, use the rubric to internally think and iterate on the best possible solution to the prompt that is provided. Remember that if your response is not hitting the top marks across all categories in the rubric, you need to start again.
</self_reflection>

<persistence>
- You are an agent - please keep going until the user's query is completely resolved, before ending your turn and yielding back to the user.
- Only terminate your turn when you are sure that the problem is solved.
- Never stop or hand back to the user when you encounter uncertainty — research or deduce the most reasonable approach and continue.
- Do not ask the human to confirm or clarify assumptions, as you can always adjust later — decide what the most reasonable assumption is, proceed with it, and document it for the user's reference after you finish acting
</persistence>

<code_editing_rules>
<guiding_principles>
- Readability: For programming language code including comments, avoid using environment-dependent characters, emojis, or other non-standard character strings.
- Maintainability: Follow proper directory structure, maintain consistent naming conventions, and organize shared logic appropriately.
- Consistency: The user interface must adhere to a consistent design system—color tokens, typography, spacing, and components must be unified.
- Visual Quality: Follow the high visual quality bar as outlined in OSS guidelines (spacing, padding, hover states, etc.)
</guiding_principles>
<developper_stack_defaults>
- Node.js >= 22 (see `engines` in `package.json`)
- Package manager: Yarn
- Language: TypeScript (strict)
- Build tool: Vite (`vite.config.ts` for Chrome/Edge MV3, `vite.firefox.config.ts` for Firefox MV2)
- Target: WebExtensions (Chrome/Edge via `manifest.json`, Firefox via `manifest.firefox.json`)
- Shell: this repo runs on Windows; use Unix-style shell syntax (forward slashes, `/dev/null`) when invoking commands through the agent's bash tool
</developper_stack_defaults>
</code_editing_rules>

<project_details>
<instruction>
CRITICAL: You MUST read the current content of [README.md](README.md) BEFORE taking any action.
</instruction>
<development_rules>
- All developer-facing documents, except `README.md`, MUST be placed in the `Documents` directory.
- After every change, you MUST run the linter and fix all issues.
- Temporary or investigative scripts (e.g., research/debug scripts) MUST be placed in the `scripts` directory.
- `package.json` `version` is the source of truth — `scripts/sync-manifest-version.js` propagates it to both `manifest.json` and `manifest.firefox.json`. Do not edit either manifest's `version` field directly; bump `package.json` and run `yarn sync:version` (or any `yarn build*` script, which runs sync automatically)
- Keep `manifest.json` (MV3) and `manifest.firefox.json` (MV2) in sync when adding/removing permissions; update the permissions list in the Deployment docs as well
- When making notable changes, update `CHANGELOG.md` following the [Keep a Changelog](https://keepachangelog.com/) format. Entries must be written in English. `CHANGELOG.md` is for end users: describe each change concisely from the user's perspective (what they can now do or what visibly changes), not the implementation. Do NOT include internal details such as file paths, IPC channel/function names, internal data structures, or code-level mechanics. Record those developer-facing details in the most relevant English Markdown document under `Documents/` instead: pick the one whose topic the change actually concerns, and keep its `-ja` counterpart in sync.
</development_rules>
</project_details>
