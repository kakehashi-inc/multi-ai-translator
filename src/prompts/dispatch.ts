/**
 * Dispatch-mode resolution.
 *
 * The dispatch mode decides whether a batch of texts is sent to the model in
 * ONE request ("block") or one request per text ("single"). This is completely
 * independent of which prompt is used: a model may keep the default prompt yet
 * still require single dispatch because batching multiple texts confuses it.
 *
 * Resolution order (first match wins):
 *   1. The prompt profile's own `dispatch` preference, if it declares one.
 *   2. A model-name match against {@link SINGLE_DISPATCH_MODEL_RULES}.
 *   3. Default: 'block'.
 *
 * To force another model into single dispatch WITHOUT giving it a custom
 * prompt, add a rule to SINGLE_DISPATCH_MODEL_RULES — nothing else needs to
 * change.
 */
import type { DispatchMode, PromptProfile } from './types';

/**
 * Each rule is a list of regexes that must ALL match the model name (logical
 * AND). A model gets single dispatch when it satisfies ANY rule.
 *
 * Using AND-of-regexes (instead of one big regex) lets a rule require several
 * independent tokens regardless of their order or of modifiers between them —
 * e.g. a name like "gemma3-qat-4b" where the size is separated from the family
 * by a "qat" tag.
 *
 * Tokens are matched with delimiter boundaries (start/end of string or one of
 * `:` `-` `_` `/` `.` whitespace) so that, for example, the family token does
 * not match inside "codegemma3" and the size "1b" does not match inside "12b"
 * or a run-together "gemma31b".
 *
 * Add a rule to opt a model (or family) into single dispatch. Models that have
 * their own prompt profile may instead declare `dispatch` on the profile (which
 * takes precedence); these rules are for models that keep the default prompt
 * but still need single dispatch.
 */
export const SINGLE_DISPATCH_MODEL_RULES: readonly (readonly RegExp[])[] = [
  // Gemma 3 in the 1B-4B size range (any order of family/size/modifier tokens,
  // e.g. "gemma3:4b", "gemma3-qat-4b", "gemma3-4b-qat").
  [/(?:^|[\s:._/-])gemma3(?:$|[\s:._/-])/i, /(?:^|[\s:._/-])[1-4]b(?:$|[\s:._/-])/i]
];

/** Whether the model name satisfies any single-dispatch rule. */
export function isSingleDispatchModel(model: string | undefined): boolean {
  if (!model) {
    return false;
  }
  return SINGLE_DISPATCH_MODEL_RULES.some((rule) => rule.every((pattern) => pattern.test(model)));
}

/**
 * Resolve the dispatch mode for a profile + model.
 * Profile preference overrides the model-name list; otherwise the list decides,
 * defaulting to 'block'.
 */
export function resolveDispatch(profile: PromptProfile, model: string | undefined): DispatchMode {
  if (profile.dispatch) {
    return profile.dispatch;
  }
  return isSingleDispatchModel(model) ? 'single' : 'block';
}
