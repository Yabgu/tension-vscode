// Where Ctrl+click goes — and, just as importantly, when it goes nowhere.
//
// EXT5 §2.4: **same file, or `~lib/`, or nothing.** A cross-file project model is EXT6.
// The rule that makes that honest is the third case: when the answer is neither, this
// returns `null` and the caller counts it, so the status bar can say "n unresolved" and
// the limit is visible instead of mysterious.
//
// **No `vscode` import here.**

import { existsSync } from "node:fs";

import { type Symbol, parseSymbols, wordAt } from "./symbols";

/** A jump target: an absolute path plus a 0-based position. */
export interface Location {
  file: string;
  /** 0-based. */
  line: number;
  /** 0-based. */
  column: number;
  /** Which rung answered: the outline this file, or the compiler's own `std/`. */
  via: "same-file" | "compiler-std";
}

/** Why a position produced no jump. Counted, so the extension can show the limit. */
export type MissReason =
  | "no-identifier"
  | "unknown-name"
  | "cross-file-import"
  | "not-in-a-checkout";

export interface DefinitionResult {
  location: Location | null;
  reason: MissReason | null;
  /** The identifier the request was about, when there was one. */
  word: string | null;
}

export interface DefinitionInput {
  /** Absolute path of the file the cursor is in. */
  file: string;
  /** Full text of that file. */
  text: string;
  /** 0-based, as VS Code gives it. */
  line: number;
  character: number;
  /** Root of the compiler package (`<pkg>/…`), used for `~lib/`. Null if not a checkout. */
  compilerRoot: string | null;
  /** Injected so tests need no filesystem; defaults to `existsSync`. */
  exists?: (path: string) => boolean;
  /** The symbols of `file`, when a caller already has them (the outline does). */
  symbols?: Symbol[];
}

/** Where the compiler's std lands, given a package root. */
export function stdPath(compilerRoot: string, name: string): string {
  return `${compilerRoot.replace(/[\\/]+$/, "")}/std/assembly/${name}.ts`;
}

/**
 * Resolve the position to a declaration, or say why it cannot.
 *
 * The `~lib/` case is real rather than a stub: the compiler ships its std as `.ts` inside
 * the package, so `<pkg>/std/assembly/task.ts` is a file an editor can actually open. That
 * is why this needs only a path, and not a project model.
 */
export function definitionAt(input: DefinitionInput): DefinitionResult {
  const exists = input.exists ?? ((path: string) => defaultExists(path));
  // **The specifier is checked first, and on purpose.** A cursor inside `"~lib/thread"`
  // is inside a string that *contains* identifiers, so a word-first order finds `lib` and
  // reports a name that means nothing. The quoted literal is the thing under the cursor.
  const specifier = specifierAt(input.text, input.line, input.character);
  if (specifier !== null) return resolveSpecifier(specifier, input, exists);

  const found = wordAt(input.text, input.line, input.character);
  if (found === null) {
    return { location: null, reason: "no-identifier", word: null };
  }

  // `~lib/task` written as a bare word does not occur; a specifier is handled above.
  const symbols = input.symbols ?? parseSymbols(input.text);

  // A property access `a.b` should resolve to `b`'s declaration inside the type of `a`.
  // Without a type graph the best honest answer is the unique member of that name;
  // when there is more than one, prefer the one whose container matches the receiver's
  // spelled type, then fall back to top-level. Anything ambiguous stays a miss.
  const local = resolveInFile(symbols, found.word, input);
  if (local !== null) {
    return {
      location: {
        file: input.file,
        line: local.line - 1,
        column: local.column - 1,
        via: "same-file",
      },
      reason: null,
      word: found.word,
    };
  }

  // A name imported from `~lib/x` — the import is in this file, so the std path is
  // reachable without a project model.
  const libImport = importProviding(input.text, found.word);
  if (libImport !== null) {
    if (input.compilerRoot === null) {
      return { location: null, reason: "not-in-a-checkout", word: found.word };
    }
    const target = stdPath(input.compilerRoot, libImport);
    if (exists(target)) {
      return { location: { file: target, line: 0, column: 0, via: "compiler-std" }, reason: null, word: found.word };
    }
    return { location: null, reason: "not-in-a-checkout", word: found.word };
  }

  return { location: null, reason: "unknown-name", word: found.word };
}

function defaultExists(path: string): boolean {
  return existsSync(path);
}

/**
 * The declaration a name refers to within one file.
 *
 * Order matters and is deliberate: a member of the *enclosing* type wins over a
 * same-named top-level function, because that is what the code at the cursor means. The
 * scan keeps source order, so the first match in the tightest container is the one the
 * user is looking at.
 */
function resolveInFile(symbols: Symbol[], word: string, input: DefinitionInput): Symbol | null {
  const enclosing = enclosingContainers(symbols, input.line + 1);

  const inContainer = symbols.filter(
    (s) => s.name === word && s.container !== null && enclosing.includes(s.container),
  );
  if (inContainer.length > 0) {
    // Innermost container first: `enclosing` is ordered outermost → innermost.
    for (let i = enclosing.length - 1; i >= 0; --i) {
      const hit = inContainer.find((s) => s.container === enclosing[i]);
      if (hit !== undefined) return hit;
    }
    return inContainer[0];
  }

  const topLevel = symbols.filter((s) => s.name === word && s.container === null);
  if (topLevel.length > 0) return topLevel[0];

  // A member of some *other* type, reached as `Foo.bar`. Unique match only.
  const anyMember = symbols.filter((s) => s.name === word && s.container !== null);
  if (anyMember.length === 1) return anyMember[0];
  return null;
}

/** The container names whose body encloses a 1-based line, outermost first. */
export function enclosingContainers(symbols: Symbol[], line: number): string[] {
  // A container's span is not recorded (the scan keeps declarations, not ranges), so this
  // uses the shape that matters: the nearest *preceding* container declaration. That is
  // exact for a well-formed file, which is the only kind this asks about — a file the
  // compiler rejects has no meaningful "enclosing" anyway.
  const containers = symbols.filter(
    (s) => s.container === null && ["class", "struct", "interface", "enum"].includes(s.kind) && s.line < line,
  );
  return containers.map((s) => s.name);
}

/** The `~lib/<name>` an imported identifier came from, if any. */
export function importProviding(text: string, word: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const named = /import\s*\{([^}]*)\}\s*from\s*"~lib\/([^"]+)"/.exec(line);
    if (named !== null) {
      const names = named[1].split(",").map((part) => part.trim().split(/\s+as\s+/).pop()?.trim());
      if (names.includes(word)) return named[2];
    }
    const star = /import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s*"~lib\/([^"]+)"/.exec(line);
    if (star !== null && star[1] === word) return star[2];
    const plain = /import\s+([A-Za-z_$][\w$]*)\s+from\s*"~lib\/([^"]+)"/.exec(line);
    if (plain !== null && plain[1] === word) return plain[2];
  }
  return null;
}

/** A `"~lib/x"` specifier under the cursor, for Ctrl+click on the import itself. */
export function specifierAt(
  text: string,
  line: number,
  character: number,
): { specifier: string; line: number; column: number; length: number } | null {
  const lines = text.split(/\r?\n/);
  if (line < 0 || line >= lines.length) return null;
  const source = lines[line];

  // **The module literal, not "a string on this line".** An import's target is the literal
  // that follows `from`, or the one directly after a bare `import`. Anything else on the
  // line is data — `print("~lib/thread")` must not be Ctrl+clickable as a reference, and
  // matching `^import|export` alone is not enough because an `export function` body can
  // hold a string too.
  if (!/^\s*(?:import|export)\b/.test(source)) return null;
  const literal = /(?:\bfrom\s+)("([^"]*)")|^\s*import\s+("([^"]*)")/.exec(source);
  if (literal === null) return null;

  const quoted = literal[1] ?? literal[3];
  const specifier = literal[2] ?? literal[4];
  const start = (literal.index ?? 0) + literal[0].length - quoted.length;
  const end = start + quoted.length;
  if (character < start || character > end) return null;
  return { specifier, line, column: start, length: quoted.length };
}

function resolveSpecifier(
  specifier: { specifier: string; line: number },
  input: DefinitionInput,
  exists: (path: string) => boolean,
): DefinitionResult {
  if (!specifier.specifier.startsWith("~lib/")) {
    // `./sibling` is EXT6's business: a cross-file project model, not this round.
    return { location: null, reason: "cross-file-import", word: specifier.specifier };
  }
  if (input.compilerRoot === null) {
    return { location: null, reason: "not-in-a-checkout", word: specifier.specifier };
  }
  const name = specifier.specifier.slice("~lib/".length);
  const target = stdPath(input.compilerRoot, name);
  if (!exists(target)) {
    return { location: null, reason: "unknown-name", word: specifier.specifier };
  }
  return {
    location: { file: target, line: 0, column: 0, via: "compiler-std" },
    reason: null,
    word: specifier.specifier,
  };
}
