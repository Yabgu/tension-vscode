// Compiler text -> positions. **No `vscode` import here.**
//
// The shapes below are not invented: each was captured from the vendored compiler
// (`035b816380d3`) and is committed under `tests/fixtures/diagnostics/`. EXT5 §3 Phase 0
// asked for four; the ones that exist are here, and the one that does not is said so in
// the round report rather than faked.
//
//   ERROR TS1109: Expression expected.
//      :
//    2 │ return 1 +;
//      │           ^
//      └─ in e_parse.ten(2,13)
//
//   ERROR TS2322: Type 'i32' is not assignable to type '~lib/string/String'.
//      :
//    2 │ let x: string = a;
//      │                 ~
//      └─ in c_multi.ten(2,19)
//
// The `└─ in <file>(<line>,<col>)` line is the anchor and is always last in a block. The
// `^` or `~~~` run under the caret line gives the **span**, which is what turns a point
// into a squiggle. Blocks are separated by a blank line, and the trailing
// `FAILURE n parse error(s)` / `FAILURE n compile error(s)` summary is not a diagnostic.
//
// ## The column convention, measured, not assumed
//
// The pair is **1-based line, 1-based column**. Measured twice against the source bytes:
//
//   line "  return nope;"  -> `nope` starts at 0-based index 9  -> compiler says (2,10)
//   line "  let x: string = a;" -> `a` at 0-based index 18      -> compiler says (2,19)
//
// VS Code wants 0-based for both, so `toRange` subtracts one from each. Getting this
// wrong shifts every squiggle by one character while every test that only checks "a
// diagnostic exists" still passes — which is why the convention has an assertion of its
// own in `tests/core.mjs`.

/** One diagnostic, with the compiler's own numbering. */
export interface Diagnostic {
  /** Path exactly as the compiler printed it — relative to the compile's cwd. */
  file: string;
  /** 1-based, as printed. */
  line: number;
  /** 1-based, as printed. */
  column: number;
  /** How many characters the `^`/`~~~` run covers, at least 1. */
  length: number;
  message: string;
  /** `TS1109`, or `null` for a line that had no code. */
  code: string | null;
  severity: "error" | "warning" | "info";
}

export interface ParseResult {
  diagnostics: Diagnostic[];
  /**
   * Blocks that carried no `└─ in <file>(<line>,<col>)` anchor and were therefore
   * dropped. **Counted, never invented into a position** (EXT5 §2.2) — a squiggle at
   * line 1 column 1 of a file the compiler did not name is worse than none.
   */
  dropped: number;
  /** How many `ERROR`/`WARNING` blocks the text contained, dropped or not. */
  blocks: number;
}

/** `└─ in file(12,7)` — the anchor. The box-drawing characters vary, so match loosely. */
const ANCHOR = /^[\s│└─\-]*in\s+(.+?)\((\d+),(\d+)\)\s*$/;

/** `ERROR TS2304: message` / `WARNING TS1234: message`. */
const HEADER = /^\s*(ERROR|WARNING|INFO)\s+(?:TS(\d+):\s*)?(.*)$/;

/** The gutter line that carries the caret run: `   │        ~~~~`. */
const CARET = /^[\s│]*([\^~]+)\s*$/;

/** `FAILURE 1 compile error(s)` — a summary, not a diagnostic. */
const SUMMARY = /^\s*FAILURE\s+\d+\s+(parse|compile)\s+error/;

/**
 * Parse the compiler's stderr into positions.
 *
 * Tolerant by design: an unrecognised line is ignored rather than aborting the parse,
 * because the compiler's decoration (the `:` line, a gutter, a box border) is not a
 * contract and a stricter parser would break on the next cosmetic change. The two lines
 * that *are* load-bearing are the header and the anchor.
 */
export function parseDiagnostics(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const out: Diagnostic[] = [];
  let dropped = 0;
  let blocks = 0;

  let current: Omit<Diagnostic, "file" | "line" | "column" | "length"> | null = null;
  let caretRun = 0;

  const finish = (anchored: { file: string; line: number; column: number } | null): void => {
    if (current === null) return;
    blocks += 1;
    if (anchored === null) {
      dropped += 1;
    } else {
      out.push({
        ...current,
        file: anchored.file,
        line: anchored.line,
        column: anchored.column,
        // A block whose caret run is missing still gets a one-character span: the
        // position is known and a zero-width range is invisible in the editor.
        length: caretRun > 0 ? caretRun : 1,
      });
    }
    current = null;
    caretRun = 0;
  };

  for (const line of lines) {
    if (SUMMARY.test(line)) {
      // The summary ends the last block; anything after it is not a diagnostic.
      finish(null);
      continue;
    }

    const header = HEADER.exec(line);
    if (header !== null) {
      // A new header closes the previous block. It is finished with **no anchor**,
      // because a block's anchor is its last line — if we are here, it never came.
      finish(null);
      const [, kind, tsCode, message] = header;
      current = {
        message: message.trim(),
        code: tsCode ? `TS${tsCode}` : null,
        severity: kind === "ERROR" ? "error" : kind === "WARNING" ? "warning" : "info",
      };
      continue;
    }

    if (current === null) continue;

    const anchor = ANCHOR.exec(line);
    if (anchor !== null) {
      const [, file, lineText, colText] = anchor;
      finish({ file: file.trim(), line: Number(lineText), column: Number(colText) });
      continue;
    }

    const caret = CARET.exec(line);
    if (caret !== null) caretRun = Math.max(caretRun, caret[1].length);
  }

  // A block at end of text with no trailing blank line still has to be closed.
  finish(null);

  return { diagnostics: out, dropped, blocks };
}

/**
 * Resolve a diagnostic's `file` (as the compiler printed it) to an absolute path.
 *
 * The compiler prints paths relative to its own working directory, which the caller set
 * to the workspace folder. `~lib/…` and absolute paths are returned unchanged: the first
 * is not a file on disk that this extension may open, and the second already is one.
 */
export function resolveFile(file: string, cwd: string): string {
  if (file.startsWith("~lib/") || /^[A-Za-z]:[\\/]/.test(file) || file.startsWith("/")) {
    return file;
  }
  const normalized = file.replace(/\\/g, "/");
  const base = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  return `${base}/${normalized}`;
}

/**
 * The 1-based pair as a 0-based half-open range.
 *
 * This is the one conversion the whole feature turns on, so it is a named function with
 * its own assertion rather than two subtractions inline in the glue.
 */
export function toRange(d: Pick<Diagnostic, "line" | "column" | "length">): {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
} {
  return {
    startLine: d.line - 1,
    startCharacter: d.column - 1,
    endLine: d.line - 1,
    endCharacter: d.column - 1 + Math.max(d.length, 1),
  };
}
