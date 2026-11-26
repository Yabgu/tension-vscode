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

  // ══ EXT2: the vocabulary the compiler has, and the grammar lacked ══════════

  // ── the decorators, by family (12 compiler names in 15 spellings) ──────────
  // Justification: `DecoratorKind.fromNode`, TensionScript/src/ast.ts:1279-1360.
  // Fixture: tests/fixtures/decorators.tension, which COMPILES except where noted.
  {
    name: "@unmanaged is a memory modifier",
    file: "decorators.tension", line: 29, text: "unmanaged", nth: 1,
    scope: "storage.modifier.memory.unmanaged.tension",
    mode: "added",
  },
  {
    name: "@managed is a memory modifier",
    file: "decorators.tension", line: 56, text: "managed", nth: 1,
    scope: "storage.modifier.memory.managed.tension",
    mode: "added",
  },
  {
    name: "@inline is a memory modifier",
    file: "decorators.tension", line: 31, text: "inline", nth: 1,
    scope: "storage.modifier.memory.inline.tension",
    mode: "added",
  },
  {
    name: "@lazy is a memory modifier",
    file: "decorators.tension", line: 32, text: "lazy", nth: 1,
    scope: "storage.modifier.memory.lazy.tension",
    mode: "added",
  },
  {
    name: "@atomic is a memory modifier (an access modifier — docs/atomics.md:71)",
    file: "decorators.tension", line: 38, text: "atomic", nth: 1,
    scope: "storage.modifier.memory.atomic.tension",
    mode: "added",
  },
  {
    name: "@external is an ABI modifier",
    file: "decorators.tension", line: 26, text: "external", nth: 1,
    scope: "storage.modifier.abi.external.tension",
    mode: "added",
  },
  {
    name: "@external.js is an ABI modifier (the JS half of the same contract)",
    file: "decorators.tension", line: 47, text: "external.js", nth: 1,
    scope: "storage.modifier.abi.external.js.tension",
    mode: "added",
  },
  {
    name: "@operator is an operator modifier",
    file: "decorators.tension", line: 42, text: "operator", nth: 1,
    scope: "storage.modifier.operator.tension",
    mode: "added",
  },
  {
    name: "@operator.binary is an operator modifier",
    file: "decorators.tension", line: 43, text: "operator.binary", nth: 1,
    scope: "storage.modifier.operator.binary.tension",
    mode: "added",
  },
  {
    name: "@operator.prefix is an operator modifier",
    file: "decorators.tension", line: 44, text: "operator.prefix", nth: 1,
    scope: "storage.modifier.operator.prefix.tension",
    mode: "added",
  },
  {
    name: "@final is a plain modifier",
    file: "decorators.tension", line: 33, text: "final", nth: 1,
    scope: "storage.modifier.final.tension",
    mode: "added",
  },
  {
    name: "@builtin is a plain modifier (library-only: src/program.ts:3016)",
    file: "decorator-builtin.tension", line: 19, text: "builtin", nth: 1,
    scope: "storage.modifier.builtin.tension",
    mode: "added",
  },
  {
    name: "@global is a plain modifier",
    file: "decorators.tension", line: 34, text: "global", nth: 1,
    scope: "storage.modifier.global.tension",
    mode: "added",
  },
  {
    name: "@unsafe is a plain modifier",
    file: "decorators.tension", line: 35, text: "unsafe", nth: 1,
    scope: "storage.modifier.unsafe.tension",
    mode: "added",
  },

  // ── the fixed-size array [T * n] ───────────────────────────────────────────
  // Justification: tests/gc/ordering-late.ts:16 and
  // tests/compiler/interop/fixed-array-unmanaged-view.ts:35 in TensionScript;
  // docs/interop-c-abi.md is the contract. Fixture compiles.
  {
    name: "`[` of a fixed array opens a fixed array, not a tuple",
    file: "fixed-array.tension", line: 23, text: "[", nth: 1,
    scope: "punctuation.definition.array.begin.tension",
    mode: "added",
  },
  {
    name: "`*` is the array-length operator",
    file: "fixed-array.tension", line: 23, text: "*", nth: 1,
    scope: "keyword.operator.array-length.tension",
    mode: "added",
  },
  {
    name: "`n` is an array length, not a general number",
    file: "fixed-array.tension", line: 23, text: "4", nth: 1,
    scope: "constant.numeric.array-length.tension",
    mode: "added",
  },
  {
    name: "`]` of a fixed array closes it",
    file: "fixed-array.tension", line: 23, text: "]", nth: 1,
    scope: "punctuation.definition.array.end.tension",
    mode: "added",
  },
  {
    name: "…and the whole type is one meta scope",
    file: "fixed-array.tension", line: 23, text: "*", nth: 1,
    stack: "meta.type.array.fixed.tension",
    mode: "added",
  },
  {
    name: "…`[f64 * 3]` in a variable annotation too",
    file: "fixed-array.tension", line: 30, text: "*", nth: 1,
    scope: "keyword.operator.array-length.tension",
    mode: "added",
  },

  // ── the task types ─────────────────────────────────────────────────────────
  // Justification: std/assembly/task.ts (Task at :360, TaskBase at :206,
  // TaskPolicy at :114, TaskRecord at :20) — and guests import them.
  {
    name: "`Task` in a type position is a known task type",
    file: "rt-guards.tension", line: 46, text: "Task", nth: 1,
    scope: "support.type.task.tension",
    mode: "added",
  },
  {
    name: "`TaskBase` in a type position is a known task type",
    file: "schedule-order.tension", line: 50, text: "TaskBase", nth: 1,
    scope: "support.type.task.tension",
    mode: "added",
  },

  // ── the ~lib/… compiler-library import ─────────────────────────────────────
  // Justification: 14 guests import from `~lib/thread`, 7 from `~lib/task`; these
  // resolve to the compiler's own std/assembly, not to files beside the guest.
  {
    name: "a `~lib/…` import is a compiler-library import",
    file: "rt-guards.tension", line: 26, text: "~lib/task", nth: 1,
    scope: "string.quoted.double.import.compiler-library.tension",
    mode: "added",
  },
  {
    name: "…whatever the module name",
    file: "schedule-order.tension", line: 44, text: "~lib/thread", nth: 1,
    scope: "string.quoted.double.import.compiler-library.tension",
    mode: "added",
  },

  // ── EXT2 controls ──────────────────────────────────────────────────────────
  {
    name: "a look-alike decorator is not a modifier (@unmanagedThing)",
    file: "decorators.tension", line: 51, text: "unmanagedThing", nth: 1,
    scope: "variable.other.readwrite.ts",
    mode: "always",
  },
  {
    name: "a user decorator is not a modifier (@myDecorator)",
    file: "decorators.tension", line: 52, text: "myDecorator", nth: 1,
    scope: "variable.other.readwrite.ts",
    mode: "always",
  },
  {
    name: "`unmanaged` used as an identifier stays an identifier",
    file: "decorators.tension", line: 54, text: "unmanaged", nth: 1,
    scope: "variable.parameter.ts",
    mode: "always",
  },
  {
    name: "a tuple type keeps TypeScript's tuple scope",
    file: "tuple-refused.tension", line: 21, text: "[", nth: 1,
    stack: "meta.type.tuple.ts",
    mode: "always",
  },
  {
    name: "…and its element types sit inside the tuple, not an array",
    file: "tuple-refused.tension", line: 21, text: "i32", nth: 2,
    stack: "meta.type.tuple",
    mode: "always",
  },
  {
    name: "a local named `Task` stays a variable",
    file: "names-not-types.tension", line: 18, text: "Task", nth: 1,
    scope: "variable.other.readwrite.ts",
    mode: "always",
  },
  {
    name: "a relative import string keeps its ordinary scope",
    file: "rt-guards.tension", line: 25, text: "../../../../tension-framework/assembly/runtime/rt", nth: 1,
    scope: "string.quoted.double.ts",
    mode: "always",
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
  // ══ EXT4: `struct`, and the primitives in every position ═════════════════

  // Justification: `src/tokenizer.ts:323` (Token.Struct), `src/parser.ts:515`, and the
  // body being a class body (`parseClassOrInterface`). Fixture compiles.
  {
    name: "`struct` is a declaration keyword",
    file: "struct-body.ten", line: 35, text: "struct", nth: 1,
    scope: "storage.type.struct.tension",
    mode: "added",
  },
  {
    name: "…and the struct's name is a type, not a variable",
    file: "struct-body.ten", line: 35, text: "Vec3", nth: 1,
    scope: "entity.name.type.struct.tension",
    mode: "added",
  },
  {
    name: "a struct field is a field declaration",
    file: "struct-body.ten", line: 48, text: "count", nth: 1,
    scope: "variable.object.property.ts",
    mode: "added",
  },
  {
    name: "…its `:` is a type annotation",
    file: "struct-body.ten", line: 48, text: ":", nth: 1,
    scope: "keyword.operator.type.annotation.ts",
    mode: "added",
  },
  {
    name: "…the body carries `meta.field.declaration`",
    file: "struct-body.ten", line: 48, text: "i8", nth: 1,
    stack: "meta.field.declaration",
    mode: "added",
  },
  {
    // **The user's first complaint, as an assertion.** `f32` inside a struct was
    // `variable.other.readwrite.alias.ts`; it is the reason this round exists.
    name: "`f32` in a struct field is a primitive type",
    file: "struct-body.ten", line: 36, text: "f32", nth: 1,
    scope: "support.type.primitive.tension",
    mode: "added",
  },
  {
    // **…and the second, which named `i8`.**
    name: "`i8` in a struct field is a primitive type",
    file: "struct-body.ten", line: 48, text: "i8", nth: 1,
    scope: "support.type.primitive.tension",
    mode: "added",
  },
  {
    name: "`v128` is a primitive type (`CommonNames`, src/common.ts:132)",
    file: "struct-body.ten", line: 39, text: "v128", nth: 1,
    scope: "support.type.primitive.tension",
    mode: "added",
  },
  {
    name: "a user-declared type in field position is a type",
    file: "struct-body.ten", line: 50, text: "Vec3", nth: 1,
    scope: "entity.name.type.ts",
    mode: "added",
  },
  {
    name: "a struct body can hold a method, with its annotations",
    file: "struct-body.ten", line: 51, text: "f32", nth: 1,
    scope: "support.type.primitive.tension",
    mode: "added",
  },
  {
    name: "…and a getter",
    file: "struct-body.ten", line: 52, text: "get", nth: 1,
    scope: "storage.type.property.ts",
    mode: "added",
  },
  {
    name: "…and a generic parameter list",
    file: "struct-body.ten", line: 47, text: "T", nth: 1,
    scope: "entity.name.type.ts",
    mode: "added",
  },

  // Primitive positions EXT2 did not cover: cast, and the primitives it never asserted.
  {
    name: "`i8` in a parameter is a primitive type",
    file: "primitive-positions.ten", line: 17, text: "i8", nth: 1,
    scope: "support.type.primitive.tension",
    mode: "added",
  },
  {
    name: "`f64` in a return type is a primitive type",
    file: "primitive-positions.ten", line: 17, text: "f64", nth: 1,
    scope: "support.type.primitive.tension",
    mode: "added",
  },
  {
    name: "`f64` in a cast is a primitive type",
    file: "primitive-positions.ten", line: 18, text: "f64", nth: 1,
    scope: "support.type.primitive.tension",
    mode: "added",
  },
  {
    name: "`u32` in a type argument is a primitive type",
    file: "primitive-positions.ten", line: 22, text: "u32", nth: 1,
    scope: "support.type.primitive.tension",
    mode: "added",
  },
  {
    name: "`i32` in `changetype<i32>` is a primitive type",
    file: "primitive-positions.ten", line: 23, text: "i32", nth: 2,
    scope: "support.type.primitive.tension",
    mode: "added",
  },
  {
    name: "`i16` in an annotation is a primitive type",
    file: "primitive-positions.ten", line: 24, text: "i16", nth: 1,
    scope: "support.type.primitive.tension",
    mode: "added",
  },

  // EXT4 controls — the primitives' names are ordinary names where the language says
  // so, and a struct's `export` is still TypeScript's export.
  {
    name: "`export` before a struct is still the export keyword",
    file: "struct-body.ten", line: 35, text: "export", nth: 1,
    scope: "keyword.control.export.ts",
    mode: "always",
  },
  {
    name: "a cast keeps `cast.expr.ts` around the primitive",
    file: "primitive-positions.ten", line: 18, text: "f64", nth: 1,
    stack: "cast.expr.ts",
    mode: "always",
  },
  {
    name: "a variable named `f32` stays a variable",
    file: "primitive-names.ten", line: 22, text: "f32", nth: 1,
    scope: "variable.other.readwrite.ts",
    mode: "always",
  },
  {
    name: "a class named `i32` keeps its type name",
    file: "primitive-names.ten", line: 17, text: "i32", nth: 1,
    scope: "entity.name.type.class.ts",
    mode: "always",
  },
  {
    name: "…and reads as a constructor where it is one",
    file: "primitive-names.ten", line: 23, text: "i32", nth: 1,
    scope: "entity.name.function.ts",
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
      ? `[ SUCCESS ] EXT4 grammar${scope}: ${result.fixtures} fixtures, ${result.total} assertions`
      : `[ FAILURE ] EXT4 grammar${scope}: ${result.failed.length} of ${result.total} assertions failed`,
  );
  process.exit(result.failed.length === 0 ? 0 : 1);
}
