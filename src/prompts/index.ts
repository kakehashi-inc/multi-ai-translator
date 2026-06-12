/**
 * Prompt + dispatch registry.
 *
 * Two independent concerns are resolved from the model name:
 *
 *  - Prompt profile (what to send / how to parse). Add a model-specific prompt:
 *      1. Create `src/prompts/profiles/<model>.ts` exporting a PromptProfile
 *         (see `profiles/hy-mt2.ts`).
 *      2. Register it in the PROFILES array below.
 *    The first profile whose `matches(model)` is true wins; otherwise the
 *    default profile is used (it never matches by itself).
 *
 *  - Dispatch mode (block vs single). To force a model to translate one text
 *    per request WITHOUT a custom prompt, add a pattern to
 *    `SINGLE_DISPATCH_MODEL_RULES` in `dispatch.ts` — no profile needed.
 */
import { defaultProfile } from './default-profile';
import { hyMt2Profile } from './profiles/hy-mt2';
import type { PromptProfile } from './types';

/**
 * Registered model-specific prompt profiles, checked in order. Add new entries
 * here.
 */
const PROFILES: readonly PromptProfile[] = [hyMt2Profile];

/**
 * Resolve the prompt profile for a model name.
 * Returns the first matching profile, or the default profile.
 */
export function resolveProfile(model: string | undefined): PromptProfile {
  return PROFILES.find((profile) => profile.matches(model)) ?? defaultProfile;
}

export { resolveDispatch, isSingleDispatchModel, SINGLE_DISPATCH_MODEL_RULES } from './dispatch';
export type { PromptProfile, PromptContext, SendPrompt, DispatchMode } from './types';
