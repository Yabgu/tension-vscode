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
 * `TensionScript/src/builtins.ts:232-244`:
 *
 *   232: i32   233: i64   234: isize   236: i16   237: u32   238: u64
 *   239: usize 240: bool  241: f32     242: f64
 *
 * (`i8`/`u8`/`u16` are declared at the same block's neighbours; the block is
 * `i8 i16 i32 i64 isize u8 u16 u32 u64 usize bool f32 f64 v128`. `v128` is a SIMD
 * vector, not a scalar annotation, and appears in no guest.)
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
