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
| **B** — this extension | `*.tension → tension` | Correct scopes: the compiler's scalar primitives as types, `on` as a task-policy keyword, plus everything TypeScript's grammar already got right (decorators, generics, strings, `async`/`await`). Indentation, bracket matching and comment toggling from TypeScript's language configuration. | **No language server**, so no completion, no hover, no diagnostics — those are absent rather than wrong, which is the point. |
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
2. `node tests/grammar.mjs` — **17 assertions over 5 fixtures**, against the shipped
   grammar. Includes the negative case: a variable named `on` must still be a variable.
3. `node tests/red-case.mjs` — **the same 8 assertions this fork adds, run against the
   unmodified upstream grammar, must all fail**, while the 9 control assertions must all
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
