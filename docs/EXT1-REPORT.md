# EXT1 — a TensionScript grammar for VS Code, tested without a GUI

| | |
|---|---|
| repository | **`~/work/tension-vscode`**, branch `main`, `git init`, **no remote, nothing pushed** |
| commits | **6** (`7f24f80` … `ad6f5fa`) |
| gate | `npm test` → **17 assertions over 5 fixtures**, plus the red case: **8/8 added assertions fail on upstream, 9/9 controls pass** |
| package | **`tension-vscode-0.0.1.vsix`**, 5 files, **20,074 bytes** |
| install | **`code --install-extension` succeeded**, output quoted in §7 |
| upstream trees | Tension `5383f56` clean · TensionScript `368742df` clean · **neither touched** |

**Three measurements changed the brief's premises, and the round follows the
measurements:**

1. **The primitives did not need a rule to be *types*.** Upstream already scopes `i32`,
   `usize`, `f32`, `u64` as `entity.name.type.ts` by position. What it cannot do is tell
   them apart from your own classes; so the addition is a *distinct* scope, not a fix.
2. **`on` is not a reserved word.** `let on = 1;` compiles. A grammar that matched the
   word everywhere would miscolour a variable, so the rule looks behind for `)`.
3. **The real `on` shape is `f() on policy`, not `on pool { … }`.** The only guest in the
   corpus that uses it is `schedule-order.tension:179-183`: `let e1 = eager() on new Eager();`.

---

## 1. Phase 0 — what was measured

### 1.1 Where VS Code is, and which grammar was forked

```
$ which code && ls -d /usr/lib/code
/usr/bin/code
/usr/lib/code

$ code --version
1.138.0
7debcd0e2acdea1c52de81bf9ee1620444407dda
x64

$ ls /usr/lib/code/extensions/typescript-basics
LICENSE.txt  language-configuration.json  package.json package.nls.json  snippets  syntaxes
```

So the grammar **was** on disk, at
`/usr/lib/code/extensions/typescript-basics/syntaxes/TypeScript.tmLanguage.json`
(193,979 bytes). Nothing was fetched from GitHub.

**A finding, stated rather than smoothed:** the brief records **1.148.0** observed on the
Windows host. This machine's install is **1.138.0**, and no Windows VS Code was reachable
from here. The version that matters for attribution is the upstream grammar commit, and
the grammar pins it itself: `"version":
"https://github.com/microsoft/TypeScript-TmLanguage/commit/48f608692aa6d6ad7bd65b478187906c798234a8"`.
Forking 1.138.0's copy of a grammar whose provenance is a named TypeScript-TmLanguage
commit is honest; forking "1.148.0" from a machine I could not read would not have been.

The forked files, with hashes, are in `docs/ATTRIBUTION.md`:
`5422ec4b90f842fd…` (grammar), `8481e77aa40ba99…` (language configuration).

### 1.2 What the upstream grammar does to a real guest — the "before" picture

Measured with `tests/tokenize.mjs`, which runs `vscode-textmate` (VS Code's own editor
engine) over `tests/fixtures/*.tension` with the unmodified grammar. Column *token* is
`fixture:line`.

| token | upstream scope | after this fork |
|---|---|---|
| `on` (schedule-order:179) | **`variable.other.readwrite.ts`** | `keyword.control.task-policy.tension` |
| `on` (schedule-order:181) | **`variable.other.readwrite.ts`** | `keyword.control.task-policy.tension` |
| `i32` (async-on-main:20) | `entity.name.type.ts` | `support.type.primitive.tension` |
| `usize` (rt-guards:29) | `entity.name.type.ts` | `support.type.primitive.tension` |
| `usize` (rt-guards:34) | `entity.name.type.ts` | `support.type.primitive.tension` |
| `f32` (rt-guards:86) | `entity.name.type.ts` | `support.type.primitive.tension` |
| `u64` (rt-guards:81) | `entity.name.type.ts` | `support.type.primitive.tension` |
| `bool` (schedule-order:97) | `entity.name.type.ts` | `support.type.primitive.tension` |
| `@` (async-on-main:19) | `punctuation.decorator.ts` | unchanged |
| `async` (async-on-main:34) | `storage.modifier.async.ts` | unchanged |
| `return` (suspend-serve:86) | `keyword.control.flow.ts` | unchanged |
| `on` as a *variable* (identifier-named-on:11) | `variable.other.readwrite.ts` | unchanged — as it must be |

**Where the upstream grammar is wrong:** one token, and only one — `on`. It reads the
task-policy connector as a variable being read, because `eager() on new Eager()` is not
TypeScript and the grammar has no other reading of it.

**Where it is right and the brief assumed otherwise:** every primitive, in every type
position tested — annotation, return type, type argument, field. TypeScript's grammar
scopes *any* identifier in a type position as `entity.name.type.ts`, and `i32` is one.
That is correct, if coarse: it cannot distinguish a built-in from your own class. The fork
keeps the position rule and gives primitives their own innermost scope so a theme can.

**What it already handles well and this fork does not touch:** decorators
(`meta.decorator.ts`), strings, comments, generics (`Task<…>` → `entity.name.type.ts`),
`async`/`await`, indentation and bracket pairs.

### 1.3 The compiler's vocabulary, with file and line

The authoritative keyword table is `tokenFromKeyword` — a `switch` on the first character —
in **`TensionScript/src/tokenizer.ts:187-358`**. Every token it can return:

```
abstract as async await break case catch class const constructor continue debugger
declare default delete do else enum exclamation export extends false finally for from
function get if implements import in instanceof interface invalid is keyof let module
namespace new null of on override package private protected public readonly return set
static string-literal struct super switch template-literal this throw true try type
typeof var void while with yield
```

The primitive type names are one contiguous block in
**`TensionScript/src/builtins.ts:230-243`**:

```
230 i8   231 i16  232 i32  233 i64  234 isize  235 u8   236 u16
237 u32  238 u64  239 usize 240 bool  241 f32   242 f64  243 v128
```

`v128` is a SIMD vector, not a scalar annotation, and is the one declared name this
fork's list omits.

**Token → declaration → real usage** (usage counted over the 30 guest sources in
`~/work/Tension/tension-core/tests/programs/` at `5383f56`):

| token | declared at | real `.tension` file that uses it |
|---|---|---|
| `on` | `src/tokenizer.ts:300` (`return Token.On`) | `async/schedule-order.tension:179` — `let e1 = eager() on new Eager();` (the only user in the corpus) |
| `async` | `src/tokenizer.ts:193` | `async/async-on-main.tension:34` |
| `await` | `src/tokenizer.ts:194` | `async/main-policy.tension`, `thread/suspend-serve.tension` |
| `i32` | `src/builtins.ts:232` | 26 files, e.g. `async/async-main-promise.tension:24` |
| `u32` | `src/builtins.ts:237` | `async/rt-guards.tension` (2 files) |
| `u64` | `src/builtins.ts:238` | `async/rt-guards.tension:81` (1 file) |
| `usize` | `src/builtins.ts:239` | 10 files, e.g. `async/rt-guards.tension:29` |
| `bool` | `src/builtins.ts:240` | 6 files, e.g. `async/schedule-order.tension:97` |
| `f32` | `src/builtins.ts:241` | `async/rt-guards.tension:86` (1 file) |
| `i64`, `f64`, `isize`, `i8`, `i16`, `u8`, `u16` | `src/builtins.ts:233`, `:242`, `:234`, `:230`, `:231`, `:235`, `:236` | **none** — declared, unexercised |
| `policy` | **not in `tokenFromKeyword`; `Token.Policy` does not exist** | used as an *identifier*: `let policy = new RemotePolicy(1, 0, -1)` (`thread/suspend-serve.tension:151`), `…(taskOrNull).policy` (`async/schedule-order.tension:77`) |

**Two consequences followed, and both are deliberate:**

- **`policy` is left alone.** The brief listed it as candidate task vocabulary "only if
  the compiler treats it as such". It does not — it is a local variable name and a field
  name in real programs. Highlighting it would be exactly the invented vocabulary rule 6
  forbids.
- **Seven primitives are included although no guest uses them.** This is not invention:
  they are a closed set the compiler declares, and a grammar that coloured `i32` while
  leaving `i64` an identifier would be wrong the first time someone wrote one. The
  unexercised seven are named above rather than quietly counted as tested.

### 1.4 Licence

VS Code's `ThirdPartyNotices.txt:1880-1900` carries, under
`microsoft/TypeScript-TmLanguage 0.0.1 - MIT`:

```
Copyright (c) Microsoft Corporation
All rights reserved.

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, ...
```

`typescript-basics/package.json` corroborates: `"license": "MIT"`, publisher `vscode`.
That text is reproduced in this repository's `LICENCE`, above this repository's own MIT
licence. No licence was guessed.

## 2. The repository

`~/work/tension-vscode`, `git init -b main`, no remote, nothing pushed.

```
package.json                       languages + grammars + language-configuration
syntaxes/tension.tmLanguage.json   the fork (generated; 194,662 bytes)
language-configuration.json        forked from TypeScript's (2,721 bytes)
tools/fork.mjs                     derives the grammar from vendor/; `--check` in CI
tests/tokenize.mjs                 headless tokenizer: `line:col token scope`
tests/grammar.mjs                  17 assertions, `always` vs `added`
tests/red-case.mjs                 the same assertions against upstream — must fail
tests/fixtures/                    4 real guests + 1 written fixture + PROVENANCE.md
vendor/                            upstream grammar and language configuration, verbatim
docs/ATTRIBUTION.md                version, commit, hashes
docs/editor.md                     modes A and B, with the measured error counts
docs/EXT1-REPORT.md                this report
LICENCE  README.md  .vscodeignore  .gitignore
.github/workflows/grammar.yml      the gate as CI
```

```
$ git log --oneline
ad6f5fa ci: run the grammar gate on push, on two OSes and two Node versions
f039328 docs: the modes table, the attribution, and the editor recipe
9ed107e feat: contribute the 'tension' language, its grammar and its editor behaviour
6a7b1e5 test: a headless tokenizer, 17 assertions, and the red case as a gate
051ff0e feat: derive the TensionScript grammar from upstream, with two additions
7f24f80 chore: vendor VS Code's TypeScript grammar and language configuration
```

## 3. The fork — what changed, and only what changed

`tools/fork.mjs` re-derives the grammar from `vendor/` on every run, so the diff is a list
and not a 194 KB hand-edit. The structural diff against upstream is **8 change sites**:

```
.information_for_contributors                list changed (3 -> 4 items)
.name                                        'TypeScript' -> 'TensionScript'
.scopeName                                   'source.ts' -> 'source.tension'
.patterns                                    list changed (3 -> 4 items)
.repository.expression.patterns              list changed (3 -> 4 items)
.repository.type.patterns                    list changed (15 -> 16 items)
.repository.tension-primitive-type           ADDED
.repository.tension-task-policy              ADDED
```

`repository`: 146 → 148 keys. Upstream's MIT header fields — `version` (the
TypeScript-TmLanguage commit) and the original `information_for_contributors` lines — are
untouched; one line is appended naming this fork.

**Size:** 193,979 → **194,662 bytes (+683)**. Both files are single-line JSON, so a line
count would be meaningless; the structural diff above is the honest measure.

**The two additions, each justified by a real file:**

- **`on` → `keyword.control.task-policy.tension`**, `(?<=\))\s*\b(on)\b(?=\s*[^;/)])`.
  Justified by `schedule-order.tension:179-183` — the corpus's only use, and its real
  shape. **Two measured constraints shaped it:**
  1. `on` is *not* reserved: `let on = 1;` compiles (vendored compiler `f97c0f03b334`,
     exit 0), so the rule cannot match the bare word. Hence the `)` lookbehind.
  2. The rule had to go into **`#expression`**, not only root `patterns`. Measured: at
     root alone, `on` still scoped as `variable.other.readwrite.ts` — the token is
     matched inside `meta.var.expr.ts`'s own rule stack, and root patterns never see it.
  Stated limitation: a call whose `)` is on an earlier line than its `on` still reads as
  an identifier. Fixing that needs a `begin`/`end` pair carrying state across lines, which
  is a larger change than the thing it fixes.
- **The compiler's 13 scalar primitives → `support.type.primitive.tension`**, included
  first inside `#type`. Justified by `builtins.ts:230-243` and by `i32` appearing in 26
  guest files. Because it is included *inside* `#type`, every enclosing scope survives —
  asserted (`meta.type.annotation` is still on the token).

**Deliberately not added:** `policy` (ordinary identifier — §1.3), `Task` (already
`entity.name.type.ts` via the generic rule, and not a keyword), `@external`/`@unmanaged`
(already `meta.decorator.ts`), `__spawnThread`/`__threadJoin`/`__spawnIndexOf` (ordinary
functions the compiler does not tokenize specially), snippets (out of scope).

**Also changed:** `scopeName` → `source.tension`. Safe by measurement, not assumption:
upstream mentions its own root scope exactly once, in the `scopeName` field itself, so no
rule `include`s it by name and nothing breaks.

## 4. The headless gate

```
$ npm test
fork: syntaxes/tension.tmLanguage.json is current
[ SUCCESS ] EXT1 grammar: 5 fixtures, 17 assertions
...
the 9 control assertions, against upstream:
  all 9 pass, as they must
[ SUCCESS ] EXT1 red case: 8/8 added assertions fail against upstream, 9/9 controls still pass
```

Verified from a **fresh clone** (`git clone` → `npm ci` → `npm test`): same three
`[ SUCCESS ]` lines, `NPM_CI=0`.

**Fixtures** — four real guests copied byte for byte from Tension `5383f56`, one written
fixture, provenance and sha256 in `tests/fixtures/PROVENANCE.md`:

| fixture | why | sha256 (16) |
|---|---|---|
| `async-on-main.tension` | the ABI contract program: async, `@external`, primitives in annotations | `94331579da193530` |
| `rt-guards.tension` | richest type vocabulary: `usize` in return *and* type-argument position, `f32`/`u64` fields, `Task<…>` | `17341c21b91e52f2` |
| `schedule-order.tension` | the corpus's **only** user of `on` | `5016250b290f9a49` |
| `suspend-serve.tension` | threads: spawn/join, served body, `RemotePolicy` | `07cbec6eb8ae844f` |
| `identifier-named-on.tension` | **written for this test** — a variable named `on`, proven legal by compiling it | — |

**The 17 assertions**, in two classes that are the whole design:

- **8 `added`** — true only of this fork. Each one runs against upstream and must fail.
- **9 `always`** — controls. `@` decorator, `async` modifier, `return` keyword, a comment,
  plus three assertions that a variable named `on` is still `variable.other.readwrite.ts`
  and two that the new rules preserve the enclosing `meta.var.expr` / `meta.type.annotation`
  scopes.

**Two assertions were reclassified after measurement.** I first wrote the two
context-preservation ones as `added`; upstream passes them (it nests `on` in
`meta.var.expr` too), so they measure regression, not change. Marking them `always` is
what the red case demanded — and it is exactly why the red case is a gate rather than a
paragraph in this report.

## 5. The red case, quoted

```
$ node tests/red-case.mjs
upstream grammar: /home/acakar/work/tension-vscode/vendor/TypeScript.upstream.tmLanguage.json

the 8 assertions this fork adds, against upstream:
  fails as required — schedule-order.tension:179:20 `on` scoped as `variable.other.readwrite.ts`, expected `keyword.control.task-policy.tension`
  fails as required — schedule-order.tension:181:18 `on` scoped as `variable.other.readwrite.ts`, expected `keyword.control.task-policy.tension`
  fails as required — async-on-main.tension:20:28 `i32` scoped as `entity.name.type.ts`, expected `support.type.primitive.tension`
  fails as required — rt-guards.tension:29:33 `usize` scoped as `entity.name.type.ts`, expected `support.type.primitive.tension`
  fails as required — rt-guards.tension:34:24 `usize` scoped as `entity.name.type.ts`, expected `support.type.primitive.tension`
  fails as required — rt-guards.tension:86:7 `f32` scoped as `entity.name.type.ts`, expected `support.type.primitive.tension`
  fails as required — rt-guards.tension:81:8 `u64` scoped as `entity.name.type.ts`, expected `support.type.primitive.tension`
  fails as required — schedule-order.tension:97:40 `bool` scoped as `entity.name.type.ts`, expected `support.type.primitive.tension`

the 9 control assertions, against upstream:
  all 9 pass, as they must
[ SUCCESS ] EXT1 red case: 8/8 added assertions fail against upstream, 9/9 controls still pass
```

This is a permanent gate, not a captured transcript: `npm test` and the CI workflow both
run it, and it fails if a future VS Code teaches its grammar about `on` (which would mean
one of this fork's additions had become redundant) or if a control assertion stops passing
(which would mean the fixtures, not the fork, were at fault).

## 6. Packaging

```
$ npx @vscode/vsce package
 DONE  Packaged: /home/acakar/work/tension-vscode/tension-vscode-0.0.1.vsix (5 files, 19.6 KB)
```

`tension-vscode-0.0.1.vsix` — **20,074 bytes**, 5 files: `package.json`,
`syntaxes/tension.tmLanguage.json`, `language-configuration.json`,
`[Content_Types].xml`, `extension.vsixmanifest`. (`vsce` also warns that the grammar is
190.1 KB; that is upstream's size, and it is unavoidable for a fork of it.) `.vscodeignore`
excludes `tests/`, `tools/`, `vendor/` and `docs/` — they are development material and
stay in the repository.

## 7. Install — attempted, and it ran

The brief allows a headless install as evidence. It worked:

```
$ code --install-extension tension-vscode-0.0.1.vsix
Installing extensions...
Extension 'tension-vscode-0.0.1.vsix' was successfully installed.

$ code --list-extensions --show-versions | grep -i tension
tension.tension-vscode@0.0.1
```

It landed at `~/.vscode-oss/extensions/tension.tension-vscode-0.0.1/`, and the grammar
that VS Code now holds is **byte-identical** to the one the gate tested
(`cmp -s` → identical; `sha256 e7219a103f9be26a7d2afe8b0e5a264a`), and tokenizes correctly
from its installed location:

```
$ node tests/tokenize.mjs --grammar ~/.vscode-oss/extensions/tension.tension-vscode-0.0.1/syntaxes/tension.tmLanguage.json \
    --only on tests/fixtures/schedule-order.tension
179:20 on source.tension meta.function.ts meta.block.ts meta.var.expr.ts keyword.control.task-policy.tension
```

## 8. Both upstream trees, unchanged

```
~/work/Tension         feat/dl45-ten-extension  HEAD 5383f56  git status --porcelain → (empty)
~/work/TensionScript-a2 feat/dl45-ten-extension HEAD 368742df  git status --porcelain → (empty)
```

**A finding against the brief's gate 8:** it expects Tension at **`cae892c`**. It is at
**`5383f56`** — DL45's tip, which is where the previous round left it and where this
round's fixtures were copied from. I did not touch either tree, so `cae892c` is not a
commit this round could have produced or reverted to; I am recording the discrepancy
rather than reconciling it silently. TensionScript's `368742df` matches the brief exactly.

## 9. What I did not verify

- **What a `.tension` file looks like in VS Code.** No editor window was opened. Every
  colour claim in this repository is a claim about **scopes**, not pixels. A theme decides
  what `support.type.primitive.tension` is painted; most themes have no rule for it and
  will fall back to their generic type colour — intended, but **not looked at**.
- **That VS Code registers the `tension` language and selects it for a `.tension` file.**
  The install succeeded and the contribution block is in the installed `package.json`, but
  extension *activation* and language *resolution* happen in a running window.
- **The CI workflow has never run.** There is no remote (by decision), so there is no run
  id. `npm test` and the workflow run the same four commands.
- **Windows.** The CI matrix includes `windows-latest` and it has not executed; the
  tokenizer's path handling on Windows is untested here.
- **The `on` limitation across line breaks** (§3) — stated, not fixed, and no fixture
  exercises it because no guest writes it that way.
- **The seven unexercised primitives.** Scoped correctly by the rule, but no fixture
  asserts `i64`/`f64`/`isize`/`i8`/`i16`/`u8`/`u16`, because no guest uses one. The rule
  is `builtins.ts`'s list; the *assertions* cover only what real files contain.
- **The `repository` URL in `package.json`** (`github.com/Yabgu/tension-vscode`) is an
  assumption about the name you will give the repo. One line to change if it differs.
- `examples/async-on-main/`, publishing, and mode C's language server — all out of scope
  and untouched.
