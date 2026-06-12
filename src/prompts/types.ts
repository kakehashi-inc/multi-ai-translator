/**
 * Prompt profile types.
 *
 * Two INDEPENDENT axes govern how a batch of texts is translated:
 *
 *  1. Prompt — what text we send to the model and how we parse its reply.
 *     Owned by a `PromptProfile` (default XML, Hy-MT2 plain prompt, ...).
 *  2. Dispatch — whether the batch is sent as ONE request ("block") or as one
 *     request per text ("single"). See `dispatch.ts`.
 *
 * These are deliberately separate: e.g. a model can keep the default prompt but
 * still need single dispatch because batching confuses it. The shared runner
 * (`BaseProvider.runTranslation`) resolves the dispatch mode, then drives the
 * profile's block- or single-prompt methods accordingly. A profile may also
 * declare its own preferred `dispatch`, which overrides the model-name list.
 *
 * The data exchanged with the rest of the app is always a plain array of texts
 * in / array of translations out; the prompt format never leaks out of a
 * profile.
 */

/** How a batch is dispatched to the model. */
export type DispatchMode = 'block' | 'single';

/**
 * Context passed to a profile when building prompts / parsing output.
 */
export interface PromptContext {
  /** Resolved source language label, or 'auto' for auto-detection. */
  sourceLanguage: string;
  /** Target language label. */
  targetLanguage: string;
  /** The selected model name (may be empty for providers without a model). */
  model?: string;
}

/**
 * A model-specific prompt profile: it owns ONLY the prompt text and parsing.
 * It knows nothing about networking or dispatch batching — the shared runner
 * calls these methods based on the resolved dispatch mode.
 *
 * Implementations live in `src/prompts/profiles/` (one file per model family)
 * and are registered in `src/prompts/index.ts`. The default profile in
 * `default-profile.ts` is the fallback.
 */
export interface PromptProfile {
  /** Stable identifier, mainly for logging/diagnostics. */
  readonly id: string;

  /**
   * Decide whether this profile applies to the given model name.
   * Matching is per-profile so each file owns its own rule (e.g. a
   * case-insensitive substring match on the model name).
   */
  matches(model: string | undefined): boolean;

  /**
   * Optional dispatch preference for this profile. When set, it OVERRIDES the
   * model-name-based dispatch list in `dispatch.ts`. Leave undefined to let the
   * model-name list (or the 'block' default) decide.
   */
  readonly dispatch?: DispatchMode;

  // --- Block dispatch: all texts in one request ---
  // Optional: a profile that always uses single dispatch (e.g. declares
  // `dispatch: 'single'`) may omit these. If the resolved mode is 'block' but a
  // profile has no block methods, the runner falls back to single dispatch.

  /** Build a single prompt that asks the model to translate every text. */
  buildBlockPrompt?(texts: string[], context: PromptContext): string;

  /**
   * Parse the block response into per-item translations, aligned 1:1 with
   * `originals` (same length, same order). Unmatched items should fall back to
   * the original text so the array stays aligned.
   */
  parseBlockResponse?(output: string, originals: string[]): string[];

  // --- Single dispatch: one request per text (always required) ---

  /** Build a prompt that translates exactly one text. */
  buildSinglePrompt(text: string, context: PromptContext): string;

  /** Parse a single-text response into the translated string. */
  parseSingleResponse(output: string, original: string): string;
}

/**
 * A function provided by the provider that sends a single prompt string to the
 * underlying API and resolves with the raw model output. The runner uses this
 * to perform the actual network call without knowing the provider.
 */
export type SendPrompt = (prompt: string) => Promise<string>;
