// The grammar's assertions: what each fixture token must *be*.
//
// Run against the shipped grammar, every assertion must pass. Run against the
// unmodified upstream TypeScript grammar (`tests/red-case.mjs`), the ones marked
// `added` must all **fail** — that is what proves they are testing this round's work
// and not TypeScript's.
//
// Every assertion names a line and a token text, not a column: a column moves when a
// fixture is re-copied, and an assertion that silently stops matching is worse than
// one that fails. `nth` picks among several identical tokens on a line, 1-based.
//
//   node tests/grammar.mjs                     # the shipped grammar, all must pass
//   node tests/grammar.mjs --grammar PATH       # any grammar
//   node tests/grammar.mjs --verbose            # print each assertion

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadGrammar, tokenizeFile } from "./tokenize.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");

/**
 * The assertions.
 *
 * `mode` is the contract:
 *   "always" — true of any correct grammar, including upstream. The controls: they
 *              prove the fixtures are being tokenized at all, and that this fork did
 *              not break what TypeScript already got right.
 *   "added"  — true only of this fork. Each one is a claim about a TensionScript
 *              token that the upstream grammar gets wrong or reads only as a generic
 *              TypeScript construct.
 *
 * `scope` is tested against the **innermost** scope; `stack` against the whole stack,
 * joined. Both are checked when both are given.
 */
export const ASSERTIONS = [
  // ── added: the `on` task-policy connector ───────────────────────────────────
  // schedule-order:179, `let e1 = eager() on new Eager();` — the real shape, and the
  // one the upstream grammar reads as a variable read.
  {
    name: "`on` after a call is a control keyword",
    file: "schedule-order.tension", line: 179, text: "on", nth: 1,
    scope: "keyword.control.task-policy.tension",
    mode: "added",
  },
  {
    // **Reclassified by measurement.** This one asserts that the new keyword keeps the
    // scopes it is nested in — and upstream, which reads `on` as an identifier, keeps
    // them too. So it is a control, not an addition: it guards this fork's rules from
    // *destroying* context, which is a different claim from adding a scope.
    name: "…and it keeps the expression's enclosing scopes",
    file: "schedule-order.tension", line: 179, text: "on", nth: 1,
    stack: "meta.var.expr",
    mode: "always",
  },
  {
    name: "`on` in a second, independent statement",
    file: "schedule-order.tension", line: 181, text: "on", nth: 1,
    scope: "keyword.control.task-policy.tension",
    mode: "added",
  },

  // ── added: the compiler's scalar primitives ────────────────────────────────
  {
    name: "`i32` is a primitive type in a parameter annotation",
    file: "async-on-main.tension", line: 20, text: "i32", nth: 1,
    scope: "support.type.primitive.tension",
    mode: "added",
  },
  {
    // Same measurement as the `on` context assertion above: upstream already nests the
    // token in `meta.type.annotation`, so this guards against regression, not change.
    name: "…and keeps the annotation scope it sits in",
    file: "async-on-main.tension", line: 20, text: "i32", nth: 1,
    stack: "meta.type.annotation",
    mode: "always",
  },
  {
    name: "`usize` is a primitive type in a return position",
    file: "rt-guards.tension", line: 29, text: "usize", nth: 1,
    scope: "support.type.primitive.tension",
    mode: "added",
  },
  {
    name: "`usize` is a primitive type inside a type argument",
    file: "rt-guards.tension", line: 34, text: "usize", nth: 1,
    scope: "support.type.primitive.tension",
    mode: "added",
  },
  {
    name: "`f32` is a primitive type on a field",
    file: "rt-guards.tension", line: 86, text: "f32", nth: 1,
    scope: "support.type.primitive.tension",
    mode: "added",
  },
  {
    name: "`u64` is a primitive type on a field",
    file: "rt-guards.tension", line: 81, text: "u64", nth: 1,
    scope: "support.type.primitive.tension",
    mode: "added",
  },
  {
    name: "`bool` is a primitive type in a return annotation",
    file: "schedule-order.tension", line: 97, text: "bool", nth: 1,
    scope: "support.type.primitive.tension",
    mode: "added",
  },

  // ── always: the negative case, and the controls ────────────────────────────
  // A variable named `on` must stay an identifier. The rule looks behind for `)`
  // precisely so that this stays true.
  {
    name: "a variable named `on` is still a variable (declaration)",
    file: "identifier-named-on.tension", line: 11, text: "on", nth: 1,
    scope: "variable.other.readwrite.ts",
    mode: "always",
  },
  {
    name: "a variable named `on` is still a variable (assignment)",
    file: "identifier-named-on.tension", line: 12, text: "on", nth: 1,
    scope: "variable.other.readwrite.ts",
    mode: "always",
  },
  {
    name: "a variable named `on` is still a variable (read)",
    file: "identifier-named-on.tension", line: 13, text: "on", nth: 1,
    scope: "variable.other.readwrite.ts",
    mode: "always",
  },
  {
    name: "a decorator is still a decorator",
    file: "async-on-main.tension", line: 19, text: "@", nth: 1,
    scope: "punctuation.decorator.ts",
    mode: "always",
  },
  {
    name: "`async` is still a modifier",
    file: "async-on-main.tension", line: 34, text: "async", nth: 1,
    scope: "storage.modifier.async.ts",
    mode: "always",
  },
  {
    name: "`return` is still a control keyword",
    file: "suspend-serve.tension", line: 86, text: "return", nth: 1,
    scope: "keyword.control.flow.ts",
    mode: "always",
  },
  {
    name: "a comment is still a comment",
    file: "schedule-order.tension", line: 1, text: "//", nth: 1,
    stack: "comment.line.double-slash.ts",
    mode: "always",
  },
];

/** Every token on `line` whose text is `text`, in order. */
function tokensAt(tokens, line, text) {
  return tokens.filter((token) => token.line === line && token.text === text);
}

/**
 * Check one assertion against a token list. Returns `null` when it holds, else a
 * one-line explanation — the reason matters, and "assertion failed" is not one.
 */
export function check(assertion, tokens) {
  const candidates = assertion.line === null
    ? tokens.filter((token) => token.text === assertion.text)
    : tokensAt(tokens, assertion.line, assertion.text);
  if (candidates.length < assertion.nth) {
    return `no \`${assertion.text}\` token at ${assertion.file}:${assertion.line ?? "anywhere"} ` +
      `(found ${candidates.length})`;
  }
  const token = candidates[assertion.nth - 1];
  if (assertion.scope !== undefined && token.scope !== assertion.scope) {
    return `${assertion.file}:${token.line}:${token.col} \`${token.text}\` scoped as ` +
      `\`${token.scope}\`, expected \`${assertion.scope}\``;
  }
  if (assertion.stack !== undefined && !token.scopes.join(" ").includes(assertion.stack)) {
    return `${assertion.file}:${token.line}:${token.col} \`${token.text}\` is not inside ` +
      `\`${assertion.stack}\` — scopes were \`${token.scopes.join(" ")}\``;
  }
  return null;
}

/**
 * Run every assertion of `mode` against `grammarPath`.
 *
 * Answers `{ total, passed, failed: [{assertion, reason}] }`. Nothing prints, so both
 * callers — the gate and the red case — decide how to report.
 */
export async function run(grammarPath, { mode = null, verbose = false } = {}) {
  const grammar = await loadGrammar(grammarPath);
  const files = new Map();
  const selected = ASSERTIONS.filter((a) => mode === null || a.mode === mode);
  const failed = [];
  let passed = 0;
  for (const assertion of selected) {
    if (!files.has(assertion.file)) {
      files.set(assertion.file, await tokenizeFile(join(repo, "tests", "fixtures", assertion.file), grammarPath));
    }
    const reason = check(assertion, files.get(assertion.file));
    if (reason === null) {
      ++passed;
      if (verbose) console.log(`  ok    ${assertion.name}`);
    } else {
      failed.push({ assertion, reason });
      if (verbose) console.log(`  FAIL  ${assertion.name}\n        ${reason}`);
    }
  }
  return { total: selected.length, passed, failed, fixtures: files.size };
}

// ------------------------------------------------------------------ the CLI ---

function parseArgv(argv) {
  const options = {
    grammar: join(repo, "syntaxes", "tension.tmLanguage.json"),
    verbose: argv.includes("--verbose"),
    mode: null,
  };
  const at = argv.indexOf("--grammar");
  if (at !== -1) options.grammar = resolve(argv[at + 1]);
  const m = argv.indexOf("--mode");
  if (m !== -1) options.mode = argv[m + 1];
  return options;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgv(process.argv.slice(2));
  const result = await run(options.grammar, { mode: options.mode, verbose: options.verbose });
  for (const { reason } of result.failed) console.log(`FAIL  ${reason}`);
  const scope = options.mode === null ? "" : ` ${options.mode}`;
  console.log(
    result.failed.length === 0
      ? `[ SUCCESS ] EXT1 grammar${scope}: ${result.fixtures} fixtures, ${result.total} assertions`
      : `[ FAILURE ] EXT1 grammar${scope}: ${result.failed.length} of ${result.total} assertions failed`,
  );
  process.exit(result.failed.length === 0 ? 0 : 1);
}
