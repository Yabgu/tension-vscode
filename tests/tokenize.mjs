// Tokenize a source file with a TextMate grammar and print `line:col token scope`.
//
// **Why this exists.** A VS Code grammar has one way to be wrong that looks like
// nothing: it silently scopes a token as the wrong thing, and the only place you see
// it is a colour in an editor you cannot assert on. This program is the assertion:
// it runs the *same* `vscode-textmate` engine VS Code runs (VS Code's editor core is
// built on it), headlessly, over a real file, and prints what each token became.
//
// It is a library first and a CLI second — `tokenizeFile` is what `tests/grammar.mjs`
// imports, and `node tests/tokenize.mjs <file>` is what a human runs to look at a
// file. One code path, so the thing a person inspects is the thing the gate checks.
//
//   node tests/tokenize.mjs tests/fixtures/async-on-main.tension
//   node tests/tokenize.mjs --grammar syntaxes/tension.tmLanguage.json --scope source.tension FILE
//   node tests/tokenize.mjs --only i32 FILE        # just the tokens whose text matches
//
// The scope printed is the **innermost** scope of the token; `scopes` on the returned
// object is the full stack, outermost first, which is what an assertion should usually
// read — a type is `meta.type.annotation entity.name.type.ts` in its context, and
// checking only the innermost would pass a grammar that scopes every identifier as a
// type.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import onigurumaModule from "vscode-oniguruma";
import textmateModule from "vscode-textmate";

// **CJS packages, two interop shapes.** `vscode-textmate` publishes CommonJS, so under
// Node's ESM loader its names arrive on `default` and a namespace import is empty —
// measured: `import * as m` gave `[]`, `m.default` gave `Registry`, `INITIAL`. Node's
// own CJS-ESM detection can also synthesise named exports, so both are accepted rather
// than pinning to one loader's current behaviour.
const textmate = textmateModule.Registry ? textmateModule : textmateModule.default;
const oniguruma = onigurumaModule.loadWASM ? onigurumaModule : onigurumaModule.default;

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");

/** The oniguruma WASM that ships beside the Node entry point. */
const wasmPath = join(repo, "node_modules", "vscode-oniguruma", "release", "onig.wasm");

let onigLibPromise = null;

/**
 * One oniguruma instance per process. `vscode-textmate` asks for it once per
 * registry, and loading a second WASM instance per grammar would double the startup
 * for no gain — the library is reentrant.
 */
function loadOnigLib() {
  if (onigLibPromise === null) {
    const wasm = readFileSync(wasmPath).buffer;
    onigLibPromise = oniguruma.loadWASM(wasm).then(() => ({
      createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
      createOnigString: (s) => new oniguruma.OnigString(s),
    }));
  }
  return onigLibPromise;
}

/**
 * A registry over one grammar file.
 *
 * `scopeName` is taken from the grammar itself rather than passed in, because the
 * scope name and the `include`s inside the grammar have to agree — a `.tmLanguage.json`
 * whose root says `source.ts` and whose injection says `source.tension` silently
 * matches nothing, and this is the cheapest place to notice.
 */
export async function loadGrammar(grammarPath) {
  const grammar = JSON.parse(readFileSync(grammarPath, "utf8"));
  const onigLib = await loadOnigLib();
  const registry = new textmate.Registry({
    onigLib: Promise.resolve(onigLib),
    loadGrammar: async (scopeName) => {
      if (scopeName === grammar.scopeName) return grammar;
      return null;
    },
  });
  const loaded = await registry.loadGrammar(grammar.scopeName);
  if (loaded === null) {
    throw new Error(`the grammar at ${grammarPath} does not declare the scope it is loaded under`);
  }
  return loaded;
}

/**
 * Tokenize `text` and return one entry per token:
 *
 *   { line, col, text, scope, scopes }
 *
 * `line` and `col` are 1-based, the way an editor reports them and the way a human
 * reads a compiler error. `col` is the column of the token's **first character**.
 * Whitespace between tokens is not returned: a token of only spaces or tabs has no
 * scopes worth asserting and would triple the output.
 */
export async function tokenizeText(grammar, text) {
  const tokens = [];
  const lines = text.split(/\r\n|\n|\r/);
  let state = textmate.INITIAL;
  for (let i = 0; i < lines.length; ++i) {
    const result = grammar.tokenizeLine(lines[i], state);
    for (const token of result.tokens) {
      const raw = lines[i].slice(token.startIndex, token.endIndex);
      if (raw.trim().length === 0) continue;
      tokens.push({
        line: i + 1,
        col: token.startIndex + 1,
        text: raw,
        scopes: token.scopes,
        scope: token.scopes[token.scopes.length - 1],
      });
    }
    state = result.ruleStack;
  }
  return tokens;
}

/** `tokenizeText` over a file, with the grammar loaded from `grammarPath`. */
export async function tokenizeFile(filePath, grammarPath = join(repo, "syntaxes", "tension.tmLanguage.json")) {
  const grammar = await loadGrammar(grammarPath);
  return tokenizeText(grammar, readFileSync(filePath, "utf8"));
}

/** `line:col token scope` — the line format the brief asks for. */
export function formatToken(token) {
  return `${token.line}:${token.col} ${token.text} ${token.scopes.join(" ")}`;
}

// ------------------------------------------------------------------ the CLI ---

function parseArgv(argv) {
  const options = {
    grammar: join(repo, "syntaxes", "tension.tmLanguage.json"),
    only: null,
    file: null,
  };
  for (let i = 0; i < argv.length; ++i) {
    const arg = argv[i];
    if (arg === "--grammar") options.grammar = resolve(argv[++i]);
    else if (arg === "--only") options.only = argv[++i];
    else if (arg.startsWith("-")) {
      console.error(`tokenize: unknown option ${arg}`);
      process.exit(2);
    } else if (options.file === null) options.file = resolve(arg);
    else {
      console.error("tokenize: one file at a time");
      process.exit(2);
    }
  }
  if (options.file === null) {
    console.error("usage: node tests/tokenize.mjs [--grammar PATH] [--only TEXT] FILE");
    process.exit(2);
  }
  return options;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgv(process.argv.slice(2));
  const tokens = await tokenizeFile(options.file, options.grammar);
  const shown = options.only === null
    ? tokens
    : tokens.filter((token) => token.text === options.only || token.text.includes(options.only));
  for (const token of shown) console.log(formatToken(token));
  console.error(`tokenize: ${shown.length} of ${tokens.length} tokens from ${options.file}`);
}
