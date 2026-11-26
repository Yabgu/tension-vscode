// A symbol table built from the text, because the compiler's AST is not reachable.
//
// **Measured, not assumed (EXT5 §3 Phase 0.6).** `dist/asc.js` exports no `parse`,
// `Program` or `Module`; `dist/assemblyscript.js` exports them, but `parse(program, …)`
// needs a program whose parser exists, which needs the std tree parsed and
// `program.initialize()` run — i.e. the CLI's whole bootstrap, in the editor, per file.
// So the outline is built here, from a scan of the source, and the round report says so
// rather than pretending otherwise.
//
// What the scan must get right is decided by what the compiler accepts, and that list
// was read out of `src/parser.ts` in an earlier round and re-confirmed here: `function`,
// `class`, `struct`, `interface`, `enum`, `namespace`, plus `@decorator` prefixes and an
// `async` modifier on functions. Members inside a `class`/`struct`/`interface` body get
// their own symbols with a `container`.
//
// **No `vscode` import here.**

/** What a symbol is, in the outline's vocabulary. */
export type SymbolKind =
  | "function"
  | "class"
  | "struct"
  | "interface"
  | "enum"
  | "namespace"
  | "field"
  | "method"
  | "constant";

export interface Symbol {
  name: string;
  kind: SymbolKind;
  /** 1-based, as written. */
  line: number;
  /** 1-based column of the *name*, not of the `export` in front of it. */
  column: number;
  /** How many characters the name is. */
  length: number;
  /** The name of the enclosing type, for a member; `null` at top level. */
  container: string | null;
  /** `@` decorators written immediately before the declaration, without the `@`. */
  decorators: string[];
  exported: boolean;
}

/** A declaration keyword, and the kind it produces at top level. */
const DECLARATIONS: Record<string, SymbolKind> = {
  function: "function",
  class: "class",
  struct: "struct",
  interface: "interface",
  enum: "enum",
  namespace: "namespace",
};

/** The kinds whose body can hold members. */
const CONTAINERS = new Set<SymbolKind>(["class", "struct", "interface", "enum"]);

/** A body-opening line for a container, so its members span is known. */
interface Frame {
  symbol: Symbol;
  /** Brace depth at which the container's body opened. */
  depth: number;
}

/**
 * Scan one file's text into symbols, in source order, members nested under their type.
 *
 * The scan is line-oriented and brace-counted. That is enough for a *declaration* outline
 * — it needs names and positions, not expression structure — and it is honest about its
 * limit: a declaration whose name is on a line by itself after the keyword (a rare but
 * legal layout) is found, because the regexes allow the name to follow on the same line
 * only. A multi-line signature's parentheses do not confuse it, because only `{` and `}`
 * outside strings and comments are counted.
 */
export function parseSymbols(text: string): Symbol[] {
  const symbols: Symbol[] = [];
  const lines = text.split(/\r?\n/);
  const stack: Frame[] = [];
  let depth = 0;
  let pendingDecorators: string[] = [];
  let container: Frame | null = null;

  for (let index = 0; index < lines.length; ++index) {
    const raw = lines[index];
    const code = stripCommentsAndStrings(raw);
    const trimmed = code.trim();

    // Decorators are collected until the declaration they apply to appears. A blank
    // line or a statement between them and the declaration clears them: a decorator
    // that decorates nothing is not this outline's business to invent.
    if (trimmed.startsWith("@")) {
      const found = [...trimmed.matchAll(/@([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
      // A decorator run may share its line with the declaration it decorates —
      // `@external export function f() {}` is how guests write it — so only a line that
      // is *nothing but* decorators ends here. The rest falls through with the decorators
      // pending, and `matchDeclaration` strips the run it sees in front of the keyword.
      const afterDecorators = trimmed.replace(/^(?:@[\w$.]+\s*)+/, "");
      if (found.length > 0) pendingDecorators.push(...found);
      if (afterDecorators.length === 0) continue;
    }

    if (trimmed.length > 0 && !trimmed.startsWith("//")) {
      const declaration = matchDeclaration(trimmed);
      if (declaration !== null) {
        const { kind, name, nameOffset, exported } = declaration;
        const column = code.indexOf(name, nameOffset) + 1;
        const symbol: Symbol = {
          name,
          kind: container !== null && isMemberKind(kind) ? memberKind(kind, container.symbol.kind) : kind,
          line: index + 1,
          column: column > 0 ? column : nameOffset + 1,
          length: name.length,
          container: container?.symbol.name ?? null,
          decorators: pendingDecorators,
          exported,
        };
        symbols.push(symbol);
        pendingDecorators = [];

        if (CONTAINERS.has(kind) && opensBody(code)) {
          container = { symbol, depth: depth };
          stack.push(container);
        }
        // `enum` members are not scanned: an enumerator is a value, and an outline of
        // values-turned-symbols is a different feature (and the compiler does not give
        // this file a way to know which are `@external`).
      } else if (pendingDecorators.length > 0) {
        pendingDecorators = [];
      }
    }

    // Brace accounting last, so a declaration on the same line as its `{` is seen before
    // the depth changes.
    for (const char of code) {
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        while (stack.length > 0 && depth <= stack[stack.length - 1].depth) {
          stack.pop();
        }
        container = stack.length > 0 ? stack[stack.length - 1] : null;
      }
    }
  }

  return symbols;
}

/** Whether a declaration kind found inside a container is a member rather than a type. */
function isMemberKind(kind: SymbolKind): boolean {
  return kind === "function" || kind === "field" || kind === "method" || kind === "constant";
}

function memberKind(kind: SymbolKind, parent: SymbolKind): SymbolKind {
  if (kind === "function") return parent === "enum" ? "constant" : "method";
  return kind;
}

/** `export function name`, `@dec export class Name`, `name(...)` inside a body. */
function matchDeclaration(trimmed: string): {
  kind: SymbolKind;
  name: string;
  nameOffset: number;
  exported: boolean;
} | null {
  // Drop a leading decorator run that survived on the same line.
  const withoutDecorators = trimmed.replace(/^(?:@[\w$.]+\s+)+/, "");
  const decoratorWidth = trimmed.length - withoutDecorators.length;

  const exported = /^export\s/.test(withoutDecorators);
  const rest = exported ? withoutDecorators.replace(/^export\s+/, "") : withoutDecorators;
  const base = decoratorWidth + (exported ? 7 : 0);

  // Keyword declarations: `async function`, `abstract class`, `declare struct`, …
  const keyword = /^(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(function|class|struct|interface|enum|namespace)\s+([A-Za-z_$][\w$]*)/.exec(
    rest,
  );
  if (keyword !== null) {
    const [, word, name] = keyword;
    return {
      kind: DECLARATIONS[word],
      name,
      nameOffset: base + keyword[0].length - name.length,
      exported,
    };
  }

  // A member: `name: Type;`, `name(...): T {`, `const NAME = …`, `static name(...)`.
  const constant = /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(withoutDecorators);
  if (constant !== null) {
    return { kind: "constant", name: constant[1], nameOffset: base + constant[0].length - constant[1].length, exported };
  }
  const method = /^(?:static\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*[(<]/.exec(rest);
  if (method !== null) {
    return { kind: "function", name: method[1], nameOffset: base + method[0].length - method[1].length - 1, exported };
  }
  const field = /^(?:static\s+)?(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*[?!]?\s*:/.exec(rest);
  if (field !== null) {
    return { kind: "field", name: field[1], nameOffset: base + field[0].length - field[1].length - 1, exported };
  }

  return null;
}

function opensBody(code: string): boolean {
  return code.includes("{");
}

/**
 * Blank out `//` comments, `/* … *\/` comments and string bodies, keeping every character
 * position, so a `{` inside a string is not counted as a brace.
 */
export function stripCommentsAndStrings(line: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < line.length; ++i) {
    const char = line[i];
    if (quote !== null) {
      if (char === "\\") {
        out += "  ";
        ++i;
        continue;
      }
      if (char === quote) {
        quote = null;
        out += char;
        continue;
      }
      out += " ";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      out += char;
      continue;
    }
    if (char === "/" && line[i + 1] === "/") {
      out += " ".repeat(line.length - i);
      break;
    }
    out += char;
  }
  return out;
}

/**
 * The identifier at a 0-based (line, character), with its span.
 *
 * Pure text work: the definition provider asks this, then `symbols.ts`' answer, then
 * `definition.ts` decides whether that is a place it can jump to.
 */
export function wordAt(
  text: string,
  line: number,
  character: number,
): { word: string; line: number; column: number; length: number } | null {
  const lines = text.split(/\r?\n/);
  if (line < 0 || line >= lines.length) return null;
  const source = lines[line];
  if (character < 0 || character > source.length) return null;

  // **Masked first, sliced after.** A word inside a string literal or a comment is not an
  // identifier reference, so Ctrl+click on `"nope"` must not jump to a function named
  // `nope`. `stripCommentsAndStrings` keeps every position, so the slice still comes from
  // the real line.
  const masked = stripCommentsAndStrings(source);

  const isWord = (ch: string): boolean => /[A-Za-z0-9_$]/.test(ch);
  let start = character;
  while (start > 0 && isWord(masked[start - 1])) --start;
  let end = character;
  while (end < masked.length && isWord(masked[end])) ++end;
  if (end === start) return null;

  const word = source.slice(start, end);
  if (!/^[A-Za-z_$][\w$]*$/.test(word)) return null;
  return { word, line: line + 1, column: start + 1, length: word.length };
}
