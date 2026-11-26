# TensionScript for VS Code

Syntax highlighting and editor behaviour for **TensionScript guest sources** —
`.tension` and `.ten`.

This is a **grammar-only** extension. It colours the language and gets indentation and
comment behaviour right. It does **not** give completion, hover, go-to-definition or
diagnostics: those come from a TypeScript language server, and this extension does not
ship one (see the modes table — mode B's whole tradeoff is stated there rather than
buried).

## Install

```sh
code --install-extension tension-vscode-0.0.1.vsix
```

Then pick a mode (§ Modes). With no further settings the extension activates and gives
`.tension`/`.ten` files the TensionScript grammar — that is mode B.

To build the `.vsix` yourself:

```sh
npm install          # dev dependencies only: vscode-textmate, vscode-oniguruma
npm test             # the grammar gate (§ Testing)
npx @vscode/vsce package
```

## Modes

There are three ways to read a `.tension` file in VS Code, and they do not differ
cosmetically — they differ in which engine reads the file.

| mode | association | what you get | what you pay |
|---|---|---|---|
| **A** — no extension | `*.tension → typescript` | The TypeScript **language server**: completion, hover, go-to-definition, refactoring. Point `tsconfig.json` at TensionScript's `types/tension-guest.d.ts` and it also knows `i32`, `usize`, `Task<T>` and the std intrinsics. | Three irreducible errors, because TypeScript has no such syntax: `@external(...)` on a function declaration (`TS1206`), `async f(): i32` (`TS1064` — in TensionScript an async function's declared type *is* its result type), and `~lib/…` imports that either do not resolve or resolve to a second copy of the compiler's source. The TS server also reports diagnostics that argue with valid guest code. |
| **B** — this extension | `*.tension → tension` | Correct scopes: the compiler's scalar primitives as types, `on` as a task-policy keyword, plus everything TypeScript's grammar already got right (decorators, generics, strings, `async`/`await`). Indentation, bracket matching and comment toggling from TypeScript's language configuration. **And, since 0.3.0:** diagnostics **from the compiler itself**, an outline, and Ctrl+click within a file or into `~lib/`. | No completion, no hover, no rename, and no cross-file jump — those need an element graph, not a compiler invocation. Diagnostics require the compiler to be found (below); when it is not, none are shown. |
| **C** — later | `tension` + an LSP | Both. | A language server: an LSP project, not a grammar. |

**Neither A nor B is wrong.** Mode A is better while you are writing new code and want
completion; mode B is better while you are reading code and would rather not have the
editor argue with it. Switch by adding or removing one line of `settings.json`:

```jsonc
// settings.json — mode B (this extension)
"files.associations": { "*.tension": "tension", "*.ten": "tension" }

// settings.json — mode A (TypeScript server)
"files.associations": { "*.tension": "typescript", "*.ten": "typescript" }
```

Both are documented, with the `tsconfig.json` that makes mode A useful, in
`docs/editor.md`.

### Where the diagnostics come from (0.3.0)

Mode B runs the real compiler. No language server, no `tsserver`, no re-implementation of
the type checker — the extension finds `tensionscript`, runs it on the file, and parses what
it prints. That is why a squiggle here is a thing the compiler will actually refuse.

It looks for the compiler in this order, and then **stops**:

1. the `tension.compilerPath` setting;
2. `<workspace>/bin/tensionscript.js`;
3. a sibling `TensionScript*` checkout's `bin/tensionscript.js`;
4. `tensionscript` on `PATH`.

If none is found **no diagnostics are shown at all**, and one status-bar item names the
setting and lists what was looked at. A wrong squiggle under correct code is worse than
none, so nothing is guessed.

A check takes about a second, so it runs 600 ms after you stop typing and again on save, and
a newer request kills the older compile. The status bar says `checking…` while it runs, then
`n diagnostic(s)`. A diagnostic the compiler printed without a position (a missing file, for
instance) is **dropped and counted**, not placed at a line it never named.

Ctrl+click resolves **within the file, or into the compiler's own `~lib/` std**. Anything
else — a cross-file project reference — returns nothing on purpose, and the status tooltip
counts the misses (`definition: 3 unresolved (last: helper — cross-file-import)`) so the
limit is visible rather than mysterious. A cross-file model is the next round.


## Scopes this grammar adds

Everything else is TypeScript's, unchanged. These are the vocabulary additions, each
justified by a compiler file and asserted against a real fixture:

| token | scope | why |
|---|---|---|
| `@unmanaged` `@managed` `@inline` `@lazy` `@atomic` | `storage.modifier.memory.<name>.tension` | the memory family — what a value is in memory, and how it is reached (`docs/memory-model.md`, `docs/atomics.md`) |
| `@external` `@external.js` | `storage.modifier.abi.<name>.tension` | the host boundary — the C and JS halves of one contract |
| `@operator` `@operator.binary` `@operator.prefix` `@operator.postfix` | `storage.modifier.operator.<name>.tension` | operator overloading |
| `@final` `@builtin` `@global` `@unsafe` | `storage.modifier.<name>.tension` | compiler directives that are none of the above |
| `[T * n]` | `meta.type.array.fixed.tension` + `punctuation.definition.array.*`, `keyword.operator.array-length`, `constant.numeric.array-length` | the fixed-size array; upstream reads it as a tuple |
| `Task` `TaskBase` `TaskRecord` | `support.type.task.tension` (in type positions) | the task types in `std/assembly/task.ts` |
| `"~lib/…"` | `string.quoted.double.import.compiler-library.tension` | a compiler-library import, not a path beside the file |
| `i32` `i64` `u32` `u64` `f32` `f64` `usize` `isize` `bool` … | `support.type.primitive.tension` | the compiler's scalar primitives |
| `on` (after a call) | `keyword.control.task-policy.tension` | `let t = f() on new Policy();` |
| `struct` | `storage.type.struct.tension`, name `entity.name.type.struct.tension` | a value struct; its body is a class body, so fields, methods, getters, generics and type annotations all scope |
| `v128` | `support.type.primitive.tension` | a SIMD vector — `CommonNames`, `src/common.ts:132` |

**What is deliberately not scoped**, because the compiler does not treat it as a keyword:
`policy` (an ordinary identifier — it is a local and a field name in real programs), and
`TaskPolicy` in `extends TaskPolicy` (which keeps `entity.other.inherited-class.ts`,
because that is what it is there).

## What is in here

```
package.json                  the language + grammar + language-configuration contributions
syntaxes/tension.tmLanguage.json   the fork (generated — see below)
language-configuration.json   forked from TypeScript's
tools/fork.mjs                derives the grammar from vendor/ (reproducible, `--check` in CI)
tests/tokenize.mjs            headless TextMate tokenizer: `line:col token scope`
tests/grammar.mjs             the assertions
tests/red-case.mjs            the same assertions against upstream, which must fail
tests/fixtures/               four real guests + one written fixture, with provenance
vendor/                       upstream TypeScript grammar and language configuration, verbatim
docs/ATTRIBUTION.md           version, commit and hashes of what was forked
```

`syntaxes/tension.tmLanguage.json` is **generated**. Do not edit it: edit
`tools/fork.mjs` and run `node tools/fork.mjs`. `npm test` fails if the checked-in file
and the generator disagree.

## Testing

```sh
npm test
```

runs three things, in this order:

1. `node tools/fork.mjs --check` — the shipped grammar is what the generator produces.
2. `node tests/manifest.mjs` — **18 checks** that every path the manifest contributes
   resolves: the grammar, the language configuration, and the language icon (a broken icon
   path draws nothing and reports nothing).
3. `node tests/grammar.mjs` — **71 assertions over 13 fixtures**, against the shipped
   grammar. Includes the negative cases: a variable named `on` must still be a variable, a
   tuple must stay a tuple, `@unmanagedThing` must not be a decorator, a variable named
   `f32` must stay a variable.
4. `node tests/red-case.mjs` — **the same 50 assertions this fork adds, run against the
   unmodified upstream grammar, must all fail**, while the 21 control assertions must all
   pass. A test nobody has seen fail is not a test, so the red case is a gate and not a
   sentence in a report.

To look at what a file tokenizes as:

```sh
node tests/tokenize.mjs tests/fixtures/schedule-order.tension | head -40
node tests/tokenize.mjs --only on tests/fixtures/schedule-order.tension
```

## Adding a keyword

Only from evidence. The compiler's keyword table is `tokenFromKeyword` in
`TensionScript/src/tokenizer.ts`; a keyword that is not in it is not a keyword, however
keyword-like it looks. `policy` is an ordinary identifier (it is a local variable name
and a field name), so it is deliberately **not** highlighted as anything special.

## Licence

MIT. The grammar and language configuration are forked from MIT-licensed VS Code
material — see `LICENCE` and `docs/ATTRIBUTION.md`.
