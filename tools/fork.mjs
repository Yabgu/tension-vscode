// Derive `syntaxes/tension.tmLanguage.json` from the upstream TypeScript grammar.
//
// **Why a script and not a hand-edited file.** The brief's gate is "the diff against
// upstream should be additions plus the language id". A hand-edited 194 KB single-line
// JSON cannot show that; a script can, because it re-derives the file from the vendored
// copy every time and the only thing that varies is the list below. It also means the
// next VS Code upgrade is `cp` + `node tools/fork.mjs`, not a merge.
//
// Upstream is vendored at `vendor/TypeScript.upstream.tmLanguage.json`, taken from the
// VS Code build on this machine (see `docs/ATTRIBUTION.md` for the version and the
// upstream grammar commit that its own `version` field names).
//
//   node tools/fork.mjs            # writes syntaxes/tension.tmLanguage.json
//   node tools/fork.mjs --check    # exits 1 if the checked-in file is stale
//
// What it changes, and nothing else:
//
//   1. `name`       "TypeScript"  -> "TensionScript"
//   2. `scopeName`  "source.ts"   -> "source.tension"
//   3. one line appended to `information_for_contributors` naming this fork
//   4. one rule prepended to root `patterns` **and to `#expression`**: `on` after `)`,
//      as a control keyword. Both, because root patterns are only consulted at the top
//      level — measured: with the rule at root alone, `let e1 = eager() on new Eager()`
//      still read `on` as `variable.other.readwrite.ts`, because the token is matched
//      inside `meta.var.expr.ts`'s own rule stack and root patterns never see it.
//   5. one include prepended to `#type`'s patterns, and the rule it includes:
//      the compiler's scalar primitives as `support.type.primitive.tension`
//
// EXT2 added four more repository keys and four one-line includes:
//
//   6. `#tension-decorator`   — the compiler's twelve decorator names, scoped by family
//   7. `#tension-fixed-array` — `[T * n]`, which upstream reads as a tuple
//   8. `#tension-task-type`   — `Task`, `TaskBase`, `TaskPolicy`, `TaskRecord`
//   9. `#tension-compiler-library-import` — the string of a `~lib/…` import
//
// Everything else — the MIT header fields, all 146 repository rules, every scope
// suffix — is upstream, byte for byte.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const upstreamPath = join(repo, "vendor", "TypeScript.upstream.tmLanguage.json");
const outPath = join(repo, "syntaxes", "tension.tmLanguage.json");

/**
 * **The compiler's scalar primitive types**, transcribed from
 * `TensionScript/src/builtins.ts:230-243`, which is one contiguous block:
 *
 *   230 i8   231 i16  232 i32  233 i64  234 isize  235 u8   236 u16
 *   237 u32  238 u64  239 usize 240 bool  241 f32   242 f64  243 v128
 *
 * `v128` (243) is a SIMD vector, not a scalar annotation, and appears in no guest, so
 * it is the one declared name this list omits.
 *
 * **Included even where no guest uses one yet.** This is not an invented keyword: it
 * is a closed set the compiler declares, and a grammar that coloured `i32` and left
 * `i64` an ordinary identifier would be wrong the first time someone wrote an `i64`.
 * Which ones the current corpus exercises is stated in the round report.
 */
const PRIMITIVES = [
  "i8", "i16", "i32", "i64", "isize",
  "u8", "u16", "u32", "u64", "usize",
  "bool", "f32", "f64",
  // **`v128`, added by EXT4.** EXT2 omitted it deliberately ("a SIMD vector, not a
  // scalar annotation, and appears in no guest"), and that reasoning was wrong in the
  // way this round exists to catch: it is in `CommonNames` (`src/common.ts:132`) and a
  // user can write it — measured, `struct S { v: v128; }` **compiles** (90 bytes). With
  // the compiler accepting it and the grammar not listing it, `v128` fell through to
  // `entity.name.type.ts`: a type, but not the primitive scope every other numeric name
  // gets. `f16` does not exist in `src/` at all and is not listed.
  "v128",
];

/**
 * The boundaries are upstream's own (`#type-primitive`, `#type-name`), so this rule
 * competes with them on exactly the same footing and wins only because it is included
 * first: no `x.i32` property access, no `i32x` identifier.
 */
const primitiveRule = {
  name: "support.type.primitive.tension",
  match:
    "(?<![_$[:alnum:]])(?:(?<=\\.\\.\\.)|(?<!\\.))(" +
    PRIMITIVES.join("|") +
    ")(?![_$[:alnum:]])(?:(?=\\.\\.\\.)|(?!\\.))",
};

/**
 * `on` as the task-policy connector: `let t = f() on new Eager();`
 *
 * **Lookbehind for `)`, and that is a measurement, not a preference.** `on` is *not*
 * a reserved word in TensionScript — `let on = 1;` compiles (tested with the vendored
 * compiler) — so a grammar that scoped every `on` as a keyword would miscolour a
 * variable. The compiler's parser accepts `on` only after a call expression, which is
 * the shape every real program in `tests/programs/` uses, and every one of those is on
 * one line.
 *
 * Stated limitation: a call whose `)` is on an earlier line than its `on` will read as
 * an identifier. TextMate tokenizes a line at a time and the rule cannot see across the
 * break without state carried by a `begin`/`end` pair, which would be a far larger and
 * more fragile change than the thing it fixes.
 */
const onRule = {
  match: "(?<=\\))\\s*\\b(on)\\b(?=\\s*[^;/)])",
  captures: { 1: { name: "keyword.control.task-policy.tension" } },
};

/**
 * **The compiler's decorators, by family** (EXT2).
 *
 * The set is `DecoratorKind.fromNode` (`TensionScript/src/ast.ts:1279-1360`), which has
 * **twelve** names where the brief listed eight — `atomic`, `global`, `unsafe` and
 * `external.js` are real compiler decorators too, and are counted in `src/`+`std/`.
 * Each family is named so a theme can colour it apart from the others; the brief's
 * point is that the scope carries the class, and TextMate has only the name to carry it
 * with.
 *
 * **Why one rule per name and not an alternation with `$1`:** a capture cannot produce a
 * different scope per alternative without backreference substitution in `name`, and a
 * rule that silently stops substituting would miscolour a whole family. Twelve small
 * rules are longer and unambiguous.
 *
 * The lookbehind is `@`, because upstream's `#decorator` consumes the `@` as its
 * `punctuation.decorator.ts` and then asks `#expression` what the name is — which is why
 * `@final` currently scopes as `variable.other.readwrite.ts`. Prepending this rule inside
 * `#decorator` puts it before `#expression` and nothing else changes.
 *
 * `(?!\.)` and `(?!\.js)` keep `@external.js` from being read as `@external` followed
 * by a property, and `(?!…)` on the bare names keeps `@unmanagedThing` out (a
 * look-alike decorator is a control in `tests/fixtures/decorators.tension`).
 */
const DECORATORS = [
  // memory family — what a value is in memory, and how it is accessed
  // (`docs/memory-model.md:10-14` for the value/view/heap split; `docs/atomics.md:71`
  // calls `@atomic` "an access modifier").
  { name: "unmanaged", scope: "storage.modifier.memory.unmanaged.tension" },
  { name: "managed", scope: "storage.modifier.memory.managed.tension" },
  { name: "inline", scope: "storage.modifier.memory.inline.tension" },
  { name: "lazy", scope: "storage.modifier.memory.lazy.tension" },
  { name: "atomic", scope: "storage.modifier.memory.atomic.tension" },
  // ABI family — the host boundary.
  { name: "external.js", scope: "storage.modifier.abi.external.js.tension" },
  { name: "external", scope: "storage.modifier.abi.external.tension" },
  // operator family — `@operator("[]")` and its three named forms (ast.ts:1352-1358).
  { name: "operator.binary", scope: "storage.modifier.operator.binary.tension" },
  { name: "operator.prefix", scope: "storage.modifier.operator.prefix.tension" },
  { name: "operator.postfix", scope: "storage.modifier.operator.postfix.tension" },
  { name: "operator", scope: "storage.modifier.operator.tension" },
  // plain — compiler directives that are not about memory, the ABI or an operator.
  { name: "final", scope: "storage.modifier.final.tension" },
  { name: "builtin", scope: "storage.modifier.builtin.tension" },
  { name: "global", scope: "storage.modifier.global.tension" },
  { name: "unsafe", scope: "storage.modifier.unsafe.tension" },
];

const decoratorRule = {
  patterns: DECORATORS.map(({ name, scope }) => ({
    match: `(?<=@)(${name.replace(/\./g, "\\.")})(?![_$[:alnum:].])`,
    captures: { 1: { name: scope } },
  })),
};

/**
 * **The fixed-size array `[T * n]`** (EXT2).
 *
 * Upstream has no such type, so `[` opens `#type-tuple` and the extent reads as a
 * number: measured before this rule, `pos: [f64 * 3]` gave
 * `meta.type.tuple.ts meta.brace.square.ts` / no scope for `*` / `constant.numeric.decimal.ts`
 * for `3`.
 *
 * **The begin is a lookahead, and that is what keeps tuples working.** `\[` is only
 * claimed when the run to the closing `]` contains `* <digits>`; a `[A, B]` tuple has no
 * `*` and is left to upstream. The optional nested pair in the lookahead lets the outer
 * bracket of `[[u8 * 2] * 3]` claim too — one level, which is what the corpus has.
 *
 * Stated limitation: deeper nesting (`[[[T * 1] * 2] * 3]`) matches its innermost two
 * levels only; TextMate has no balanced-bracket matching to reach further.
 */
const fixedArrayRule = {
  name: "meta.type.array.fixed.tension",
  begin: "\\[(?=[^\\[\\]]*(?:\\[[^\\[\\]]*\\])?[^\\[\\]]*\\*\\s*\\d+\\s*\\])",
  beginCaptures: { 0: { name: "punctuation.definition.array.begin.tension" } },
  end: "\\]",
  endCaptures: { 0: { name: "punctuation.definition.array.end.tension" } },
  patterns: [
    { match: "\\*", name: "keyword.operator.array-length.tension" },
    { match: "\\d+", name: "constant.numeric.array-length.tension" },
    { include: "#type" },
  ],
};

/**
 * **The task types** (EXT2) — `std/assembly/task.ts`'s two classes and its policy base.
 *
 * `TaskRecord` is included because guests import it beside `Task`
 * (`tests/fixtures/rt-guards.tension:26`, verbatim from a real guest) and a grammar that
 * knew `Task` but not `TaskRecord` would be half a fact.
 *
 * `(?!\.)` keeps `x.Task` a property; the rule lives inside `#type`, so a variable
 * named `Task` — which compiles, measured — is untouched.
 */
const taskTypeRule = {
  match:
    "(?<![_$[:alnum:]])(?:(?<=\\.\\.\\.)|(?<!\\.))(Task|TaskBase|TaskPolicy|TaskRecord)(?![_$[:alnum:]])(?:(?=\\.\\.\\.)|(?!\\.))",
  captures: { 1: { name: "support.type.task.tension" } },
};

/**
 * **The string of a `~lib/…` import** (EXT2).
 *
 * `~lib/task` is not a module path; it is the compiler's own `std/assembly/task.ts`,
 * resolved by the compiler rather than the filesystem — 14 guests import from
 * `~lib/thread` and 7 from `~lib/task`. A reader deserves to see that these are library
 * imports and not files next door.
 *
 * Matched inside `#import-declaration`, before `#string`, and only for the two quote
 * styles the corpus uses. `from "./sibling"` keeps its ordinary scope, which is a control
 * assertion.
 */
const compilerLibraryImportRule = {
  patterns: [
    // Double-quoted — the form all 21 real `~lib/…` imports use.
    {
      match: '(")(~lib/[^"\n]*)(")',
      captures: {
        1: { name: "string.quoted.double.import.compiler-library.tension punctuation.definition.string.begin.tension" },
        2: { name: "string.quoted.double.import.compiler-library.tension" },
        3: { name: "string.quoted.double.import.compiler-library.tension punctuation.definition.string.end.tension" },
      },
    },
    // Single-quoted, for symmetry with upstream's two string rules. No guest in the
    // corpus uses this form — stated in the report rather than implied by a rule.
    {
      match: "(')(~lib/[^'\\n]*)(')",
      captures: {
        1: { name: "string.quoted.single.import.compiler-library.tension punctuation.definition.string.begin.tension" },
        2: { name: "string.quoted.single.import.compiler-library.tension" },
        3: { name: "string.quoted.single.import.compiler-library.tension punctuation.definition.string.end.tension" },
      },
    },
  ],
};

/**
 * **`struct` and its body** (EXT4).
 *
 * `struct` is a real keyword — `src/tokenizer.ts:323` returns `Token.Struct` and
 * `src/parser.ts:515` parses it — but **no file under `tension-core/tests/programs/`
 * used it**, so EXT1's and EXT2's fixtures never exercised it and the grammar inherited
 * upstream TypeScript, which has no `struct`. Measured with the shipped grammar before
 * this rule:
 *
 *   export   keyword.control.export.ts
 *   struct   variable.other.readwrite.alias.ts     <- a variable
 *   Vec3     variable.other.readwrite.alias.ts     <- a variable
 *   x        variable.other.readwrite.alias.ts     <- no field scope
 *   f32      variable.other.readwrite.alias.ts     <- a variable, not a type
 *
 * **Why it looked fine.** EXT2 proved the primitive rule fires in a *class* body
 * (`kind: i32` → `support.type.primitive.tension`), because upstream established
 * `meta.field.declaration` + `meta.type.annotation` there. A struct body got neither, so
 * the primitive rule in `#type` had nothing to be included into. Class bodies working is
 * exactly why every fixture passed.
 *
 * **The body is upstream's, not a copy of it.** `struct` delegates to
 * `parseClassOrInterface` in the compiler, so what a struct accepts *is* what a class
 * accepts minus inheritance — measured: generics compile, methods compile, `@unmanaged`
 * and `@managed` compile, `extends` is refused with `AS100 Not implemented: inheritance
 * on an @inline struct`. So this rule reuses `#class-or-interface-body` via
 * `#class-declaration-or-expression-patterns` unchanged, and every scope inside the body
 * (field declarations, method signatures, parameter and return annotations, nested
 * types) is upstream's own. The only new scopes are the keyword and the name.
 *
 * The name rule comes first, with a lookbehind on `struct`, so it claims the identifier
 * and the generic `entity.name.type.class.ts` rule after it does not.
 */
const structRule = {
  name: "meta.struct.tension",
  begin:
    "(?<![_$[:alnum:]])(?:(?<=\\.\\.\\.)|(?<!\\.))(?:(\\bexport)\\s+)?(?:(\\bdeclare)\\s+)?\\b(struct)\\b(?=\\s+|/[/*])",
  // `export` and `declare` are captured on the **begin match**, not by a pattern
  // inside: the begin consumes them, so an inner rule would never see the position.
  // Measured — the first version scoped `export` as nothing at all.
  beginCaptures: {
    1: { name: "keyword.control.export.ts" },
    2: { name: "storage.modifier.ts" },
    3: { name: "storage.type.struct.tension" },
  },
  end: "(?<=\\})",
  patterns: [
    { include: "#comment" },
    {
      match: "(?<=\\bstruct\\s+)[_$[:alpha:]][_$[:alnum:]]*",
      captures: { 0: { name: "entity.name.type.struct.tension" } },
    },
    { include: "#class-declaration-or-expression-patterns" },
  ],
};

function build() {
  const upstream = JSON.parse(readFileSync(upstreamPath, "utf8"));

  // 1-3: identity and attribution. `version` is upstream's own text and stays untouched.
  upstream.name = "TensionScript";
  upstream.scopeName = "source.tension";
  upstream.information_for_contributors = [
    ...(upstream.information_for_contributors ?? []),
    "This fork for TensionScript adds a task-policy `on` keyword and the compiler's " +
      "scalar primitive types, and changes only `name` and `scopeName` otherwise. " +
      "Generated by tools/fork.mjs; see docs/ATTRIBUTION.md.",
  ];

  // 4: the `on` rule. In `#expression` it is tried before `#identifiers` can read `on`
  // as a variable name; at root it covers statement-level positions.
  upstream.patterns = [{ include: "#tension-task-policy" }, ...upstream.patterns];
  upstream.repository["tension-task-policy"] = onRule;
  upstream.repository.expression.patterns = [
    { include: "#tension-task-policy" },
    ...upstream.repository.expression.patterns,
  ];

  // 5: primitives, first inside `#type` so every type position (annotation, parameter,
  // return type, type argument) gets them, with the enclosing scopes preserved.
  upstream.repository.type.patterns = [
    { include: "#tension-primitive-type" },
    ...upstream.repository.type.patterns,
  ];
  upstream.repository["tension-primitive-type"] = primitiveRule;

  // 6: decorators, before upstream's `#expression` can read the name as an identifier —
  // and also inside `#type`, because TensionScript writes decorators **on types**
  // (`@unmanaged [u32 * 4]`, `@managed Heap`), which upstream has no rule for: measured
  // before this include, `\`@managed Heap\`` scoped `managed` as `entity.name.type.ts`
  // and left the `@` unscoped. The lookbehind makes the pattern inert anywhere a name is
  // not preceded by `@`, so including it in `#type` cannot claim a plain type name.
  upstream.repository["tension-decorator"] = decoratorRule;
  upstream.repository.decorator.patterns = [
    { include: "#tension-decorator" },
    ...upstream.repository.decorator.patterns,
  ];

  // 7: `[T * n]`, before `#type-tuple` claims the bracket.
  upstream.repository["tension-fixed-array"] = fixedArrayRule;
  upstream.repository.type.patterns = [
    { include: "#tension-fixed-array" },
    ...upstream.repository.type.patterns,
  ];

  // 8: the task types, after the primitives and before the generic `#type-name`.
  upstream.repository["tension-task-type"] = taskTypeRule;
  const typePatterns = upstream.repository.type.patterns;
  const taskAt = typePatterns.findIndex((p) => p.include === "#comment");
  typePatterns.splice(taskAt, 0, { include: "#tension-task-type" });
  typePatterns.splice(taskAt, 0, { include: "#tension-decorator" });

  // 10: `struct`, first in `#declaration`. It must precede `#export-declaration`,
  // which is what claimed `export struct …` and wrapped the whole file in
  // `meta.export.ts` with no body rule at all.
  upstream.repository["tension-struct"] = structRule;
  upstream.repository.declaration.patterns = [
    { include: "#tension-struct" },
    ...upstream.repository.declaration.patterns,
  ];

  // 9: `~lib/…` import strings, before `#string` matches them as ordinary strings.
  upstream.repository["tension-compiler-library-import"] = compilerLibraryImportRule;
  upstream.repository["import-declaration"].patterns = [
    { include: "#tension-compiler-library-import" },
    ...upstream.repository["import-declaration"].patterns,
  ];

  return upstream;
}

const text = JSON.stringify(build()) + "\n";

if (process.argv.includes("--check")) {
  let current = null;
  try {
    current = readFileSync(outPath, "utf8");
  } catch {
    current = null;
  }
  if (current !== text) {
    console.error("fork: syntaxes/tension.tmLanguage.json is stale — run `node tools/fork.mjs`");
    process.exit(1);
  }
  console.log("fork: syntaxes/tension.tmLanguage.json is current");
} else {
  writeFileSync(outPath, text);
  const upstreamBytes = readFileSync(upstreamPath).length;
  console.log(
    `fork: wrote syntaxes/tension.tmLanguage.json (${Buffer.byteLength(text)} bytes; ` +
      `upstream ${upstreamBytes}; +${Buffer.byteLength(text) - upstreamBytes})`,
  );
}
