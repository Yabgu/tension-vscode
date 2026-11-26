// What the status bar says. **No `vscode` import here**, so the strings are assertable.
//
// The extension's most important behaviour is the one that shows nothing — "compiler not
// found, so no diagnostics" (EXT5 §2.1). If that text lived in `extension.ts`, the only
// way to check it would be to open an editor and read the status bar, which is exactly the
// kind of gate this round exists to avoid. So the copy lives here and the glue assigns it.

import type { CompilerFound } from "./compiler";
import { SETTING } from "./compiler";

export interface StatusItem {
  text: string;
  tooltip: string;
}

/** Whether a compile should be started at all. */
export function shouldCheck(found: CompilerFound): boolean {
  return found.ok;
}

/** The "found it" item, which names the path so a user can see which compiler is used. */
export function foundStatus(found: CompilerFound & { ok: true }): StatusItem {
  return {
    text: "$(check) TensionScript: compiler found",
    tooltip: `Using ${found.path} (found via ${found.via})`,
  };
}

/**
 * The "not found" item.
 *
 * It lists **what was looked at** and names the setting, because "compiler not found" with
 * no list sends a user to their own setup with nothing to check. It also states the rule
 * the silence follows, so the absence of squiggles reads as a decision rather than a bug.
 */
export function notFoundStatus(found: CompilerFound & { ok: false }): StatusItem {
  return {
    text: `$(warning) TensionScript: compiler not found — set \`${SETTING}\``,
    tooltip: [
      "The TensionScript compiler was not found, so **no diagnostics are shown**.",
      "A wrong squiggle under correct code is worse than none, so nothing is guessed.",
      "",
      "Looked for:",
      ...found.tried.map((line) => `  • ${line}`),
      "",
      `Set \`${SETTING}\` to the path of \`bin/tensionscript.js\`.`,
    ].join("\n"),
  };
}

export interface CheckSummaryInput {
  /** `ERROR`/`WARNING` blocks the compiler printed. */
  blocks: number;
  /** How many became diagnostics. */
  kept: number;
  /** How many were dropped for having no position. */
  dropped: number;
  timedOut: boolean;
  /** Set when the child could not start at all. */
  error?: string;
}

/** The item after a check. Names the dropped count, so a loss is never silent. */
export function checkStatus(summary: CheckSummaryInput): StatusItem {
  if (summary.timedOut) {
    return { text: "$(warning) TensionScript: check timed out", tooltip: "The compiler did not finish in time." };
  }
  if (summary.error !== undefined) {
    return { text: "$(error) TensionScript: compiler failed to start", tooltip: summary.error };
  }
  if (summary.blocks === 0) {
    return { text: "$(check) TensionScript: no diagnostics", tooltip: "The compiler reported nothing." };
  }
  const dropped = summary.dropped > 0 ? ` (${summary.dropped} without a position, dropped)` : "";
  return {
    text: `$(check) TensionScript: ${summary.kept} diagnostic(s)${dropped}`,
    tooltip: `blocks: ${summary.blocks}, kept: ${summary.kept}, dropped: ${summary.dropped}`,
  };
}
