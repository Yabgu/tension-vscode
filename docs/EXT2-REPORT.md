# EXT2 — the vocabulary a grammar can honestly carry

| | |
|---|---|
| repository | **`~/work/tension-vscode`**, `main`, **13 commits**, clean, **no remote, nothing pushed** |
| gate | `npm test` → **`[ SUCCESS ] EXT2 grammar: 10 fixtures, 48 assertions`** |
| red case | **`[ SUCCESS ] EXT2 red case: 32/32 added assertions fail against upstream, 16/16 controls still pass`** |
| package | **`tension-vscode-0.1.0.vsix`**, 7 files, **25,007 bytes**; installed, `@0.1.0` listed |
| Tension | **`main` `cae892c`**, clean |
| TensionScript | **`develop` `368742df`**, clean |
| `--check` | **9/9 PASS**; `inputs 800f07d27523` / `bundles f97c0f03b334` |

**Four of the brief's items were contradicted by the tree, and each is reported below
rather than smoothed over:** the compiler has **twelve** decorators, not eight (§4.1);
the `[u32 * 4]` count is 30 mentions and **all 30 are in comments** (§4.3); tuples are
**parsed but not implemented** (§4.4); and `async`/`await` are **lexically identical** to
TypeScript's, so nothing was added for them (§4.5).

---

## 1. Phase 0 — the trees converge

### 1.1 What was wrong, and whether it was fixable forward

```
Tension                          feat/dl45-ten-extension  5383f56
  origin/main = origin/develop  cae892c
  is 5383f56 an ancestor of cae892c?  yes        ← so a fast-forward, not a reset
TensionScript                    feat/dl45-ten-extension  368742df
  origin/main = origin/develop  368742df        ← already the tip
```

**No reset, no force, no rebase.** Two fast-forwards and a submodule checkout:

```
$ cd ~/work/TensionScript-a2 && git checkout develop && git merge --ff-only origin/develop
$ cd ~/work/Tension          && git checkout main    && git merge --ff-only origin/main
$ git submodule update --init --checkout third_party/TensionScript
  Submodule path 'third_party/TensionScript': checked out '368742df80bcf17f09ab743a158dd66595f97e97'
```

The submodule was at **`2473e52a`** — EXT1's pin — with `main` expecting `368742df`; that
one line was the whole of the dirtiness, and checking it out is what `cae892c` asks for.

### 1.2 The re-vendor I115 requires

```
$ npm run compiler:vendor
vendor-compiler: .packs/yabgu_gm-tensionscript-0.14.1-g368742df80bc.tar (25.10 MB)
vendor-compiler: @yabgu_gm/tensionscript → file:.packs/yabgu_gm-tensionscript-0.14.1-g368742df80bc.tar
vendor-compiler: package-lock.json no longer pins this tarball's integrity
                 (dist/binaryen.js is built per platform; the submodule gitlink is the pin)
$ rm -rf node_modules/@yabgu_gm/tensionscript && npm install
ensure-compiler: up to date — 0.14.1 at 368742df80bc
added 1 package in 595ms
```

**The three records agree, and they name the same tarball:**

| record | value |
|---|---|
| `package.json` | `yabgu_gm-tensionscript-0.14.1-g368742df80bc.tar` |
| `package-lock.json` | `yabgu_gm-tensionscript-0.14.1-g368742df80bc.tar` |
| `.packs/manifest.json` | `"tarball": "yabgu_gm-tensionscript-0.14.1-g368742df80bc.tar"`, packed `2026-11-26T18:39:41Z` |

**`npm install` rewrote `package-lock.json` by one line** — the `integrity` hash for the
tarball, which the vendoring script had already said it would drop (a per-platform
`dist/binaryen.js` cannot be pinned by hash). That is generated-file noise; **I reverted it
and did not commit it**, and `--check` still reads 9/9 with the lock at `HEAD`.

**The installed identity, in labelled spaces:**

```
inputs      800f07d27523     (159 source inputs → dist/assemblyscript.js)
bundles     f97c0f03b334     (dist/asc.js + dist/assemblyscript.js, sha256)
per-file    70 of 70 guest build records name f97c0f03b334
artifact    dist/asc.js at node_modules/@yabgu_gm/tensionscript/dist/asc.js
```

### 1.3 `--check`, every row

```
link                                          expected                      actual                          status
--------------------------------------------  ----------------------------  ------------------------------  -------
compiler: src → dist/assemblyscript.js        159 inputs → 800f07d27523     recorded 800f07d27523           PASS
compiler: dist → installed                    f97c0f03b334 (tree)           f97c0f03b334 (installed)        PASS
compiler: std mirror (no compile reads it)    81 files identical            81 identical                    PASS
runtime: src → release                        84 inputs → fefddc6e7a0b      recorded fefddc6e7a0b           PASS
runtime: src → debug                          84 inputs → fefddc6e7a0b      recorded fefddc6e7a0b           PASS
fixtures: committed .wasm                     15 present, none behind its…  15 present, all current         PASS
guests: tests/programs/**/*.tension → build…  35 built after source         35 current                      PASS
guests: built by the installed compiler       70 recorded by f97c0f03b334   70 of 70 current                PASS
docs: docs/abi/*.md                           generator --check clean       current                         PASS

rebuild: 9/9 links PASS
```

```
$ git -C ~/work/Tension        status --porcelain | wc -l   → 0     (main @ cae892c)
$ git -C ~/work/TensionScript-a2 status --porcelain | wc -l   → 0     (develop @ 368742df)
```

---

## 2. The declaration, and the measured delta

**Declared before running:** 4 new repository keys, assertions **17 → 47** (30 new),
fixtures **5 → 9**.

**Measured:** 4 new repository keys, assertions **17 → 48** (31 new: 24 added, 7 controls),
fixtures **5 → 10**.

Two over the declaration, and the rule says a count above the declaration is a finding:

- **the extra assertion** is `[f64 * 3]` in a *variable* annotation (line 30 of
  `fixed-array.tension`) — I planned two array shapes and found three real ones in the
  fixture, so there is one more positive than planned;
- **the extra fixture** is `names-not-types.tension`. I intended to fold the
  "a local named `Task`" control into an existing fixture; putting a name-inventing
  program inside a copied guest would have contaminated the copy, so it got its own file.

Neither is a bonus I am claiming — both are named here because the gate asked for the
count to be declared first.

---

## 3. The rules

`tools/fork.mjs` remains the only way the grammar file is produced. **Re-running it
reproduces the file byte for byte** — `7e4de94bce2d9655…` before and after — and
`node tools/fork.mjs --check` reports `current`. 14 change sites against upstream, 6 added
repository keys (2 from EXT1, 4 here), 146 → 152 keys, 193,979 → **197,978 bytes
(+3,999)**.

### 3.1 The rule table

| scope | compiler file:line | asserted against | control |
|---|---|---|---|
| `storage.modifier.memory.unmanaged.tension` | `src/ast.ts:1346` (`fromNode`); `docs/memory-model.md:12` | `decorators.tension:29` (`@unmanaged class Ptr`) | — |
| `storage.modifier.memory.managed.tension` | `src/ast.ts:1336`; `docs/memory-model.md:14` | `decorators.tension:56` (`let h: @managed Heap`) | — |
| `storage.modifier.memory.inline.tension` | `src/ast.ts:1326`; `docs/memory-model.md:10` | `decorators.tension:31` | — |
| `storage.modifier.memory.lazy.tension` | `src/ast.ts:1331` | `decorators.tension:32` | — |
| `storage.modifier.memory.atomic.tension` | `src/ast.ts:1301`; `docs/atomics.md:71` ("an access modifier") | `decorators.tension:38` | — |
| `storage.modifier.abi.external.tension` | `src/ast.ts:1311` | `decorators.tension:26` | — |
| `storage.modifier.abi.external.js.tension` | `src/ast.ts:1359-1363` | `decorators.tension:47` | — |
| `storage.modifier.operator.tension` | `src/ast.ts:1341` | `decorators.tension:42` | — |
| `storage.modifier.operator.binary.tension` | `src/ast.ts:1352` | `decorators.tension:43` | — |
| `storage.modifier.operator.prefix.tension` | `src/ast.ts:1355` | `decorators.tension:44` | — |
| `storage.modifier.final.tension` | `src/ast.ts:1316` | `decorators.tension:33` | — |
| `storage.modifier.builtin.tension` | `src/ast.ts:1306`; validity `src/program.ts:3016` | `decorator-builtin.tension:19` | — |
| `storage.modifier.global.tension` | `src/ast.ts:1321` | `decorators.tension:34` | — |
| `storage.modifier.unsafe.tension` | `src/ast.ts:1347` | `decorators.tension:35` | — |
| *(all 15 spellings above)* | — | — | `@unmanagedThing` → `variable.other.readwrite.ts`; `@myDecorator` → same; bare `unmanaged` parameter → `variable.parameter.ts` |
| `meta.type.array.fixed.tension` + `punctuation.definition.array.begin/end.tension` | `tests/gc/ordering-late.ts:16`; `docs/interop-c-abi.md` | `fixed-array.tension:23` (`[` and `]`) | tuple `[` → `meta.type.tuple.ts` |
| `keyword.operator.array-length.tension` | same | `fixed-array.tension:23`, `:30` | — |
| `constant.numeric.array-length.tension` | same | `fixed-array.tension:23` (`4`) | tuple element still inside `meta.type.tuple` |
| `support.type.task.tension` | `std/assembly/task.ts:360` (Task), `:206` (TaskBase), `:20` (TaskRecord) | `rt-guards.tension:46`, `schedule-order.tension:50` | a local named `Task` → `variable.other.readwrite.ts` |
| `string.quoted.double.import.compiler-library.tension` | 14 guests import `~lib/thread`, 7 `~lib/task` | `rt-guards.tension:26`, `schedule-order.tension:44` | `"../../../…/rt"` → `string.quoted.double.ts` |

**Every addition carries a control** — 15 spellings, 7 controls, and the three the brief
asked for by name are all present: `@unmanagedThing`, `myDecorator`, and a bare
`unmanaged` used as an identifier.

### 3.2 Two things the fork had to do that were not obvious

1. **`#tension-decorator` is included twice** — in `#decorator` *and* in `#type`.
   Upstream's decorator rule is reached only from statement/class positions; inside a type
   annotation `@` is unscoped and the name reads as `entity.name.type.ts`. Measured on
   `let h: @managed Heap` before the second include:
   `56:9 @` (no scope), `56:11 managed entity.name.type.ts`. TensionScript writes
   decorators **on types** (`@unmanaged [u32 * 4]`, `@managed Heap`), so the rule has to
   live there too. The `(?<=@)` lookbehind makes it inert on a name not preceded by `@`.
2. **`#tension-fixed-array` begins with a lookahead, not with `\[`.** Claiming every `[`
   would swallow tuples. The begin is only taken when the run to `]` contains
   `* <digits>` — so `[A, B]` never matches and keeps upstream's scope.

---

## 4. What the tree refused, and what it said

### 4.1 The compiler has **twelve** decorators, not eight

`DecoratorKind.fromNode` (`src/ast.ts:1259-1274` is the enum, `:1279-1360` the switch):

```
atomic  builtin  external  final  global  inline  lazy  managed  operator
unmanaged  unsafe   + the property forms operator.binary/.prefix/.postfix and external.js
```

The brief named eight. The four it omitted — **`@atomic`, `@global`, `@unsafe`,
`@external.js`** — are real, and counted in `src/`+`std/` (`@atomic` 45 occurrences,
`@global` 100, `@unsafe` 162, `@external.js` 8). Rule 2 of the brief says a rule exists
only if a real file needs it; these files exist, so they are in the grammar and in the
rule table above. **`@atomic` went into the memory family**, because `docs/atomics.md:71`
calls it "an access modifier" — an ordering guarantee on memory, not an ABI or an
operator.

### 4.2 `@builtin` cannot appear in a guest

`src/program.ts:3016-3018`:

```ts
if (declaration.range.source.isLibrary) {
  validDecorators |= DecoratorFlags.Builtin;
}
```

A guest gets `ERROR AS212: Decorator '@builtin' is not valid here.` So the decorators
fixture is split: **`decorators.tension` holds the eleven a guest may carry and
compiles** (5,061 B, `--enable threads`), and `decorator-builtin.tension` holds `@builtin`
with the error quoted in its own header. The grammar still scopes it — an editor has no
idea whether the buffer will be compiled as a library.

### 4.3 `[u32 * 4]` "20 times in `std/`+`src/`" — 30 mentions, **all in comments**

```
total in src/+std/:                        30
of which on comment-only lines:            30
code lines:                                 0
```

The brief's count is right and its implication is not: those are doc-comment examples
(`src/compiler.ts:3882`, `:17259-17260`, `:17602`), not declarations. The **real code**
sites are in the compiler's test tree:

```
tests/gc/ordering-late.ts:16      view: @unmanaged [u32 * 4] = changetype<@unmanaged [u32 * 4]>(0);
tests/gc/ordering-early.ts:6      (the same line)
tests/gc/coverage.ts:20, :25      [u32 * 4], [u32 * 8]
tests/compiler/interop/fixed-array-unmanaged-view.ts:35-38   sizeof<@unmanaged [u32 * 4]>() …
```

That file is what justifies the rule and what `fixed-array.tension` is transcribed from.

### 4.4 Tuples: parsed, not implemented

The control question was "does TensionScript have tuple types at all?" Measured:

```
$ tensionscript tuple-refused.tension -o x.wasm --enable multi-value
ERROR AS100: Not implemented: Tuple types
$ tensionscript tuple-refused.tension -o x.wasm
ERROR TS1110: Type expected.
```

The **parser** has the arm (`src/parser.ts:1021-1053`, gated on `Feature.MultiValue`) and
`TypeNode` has `TupleType` (`src/ast.ts:191`); the **compiler refuses every use**. So no
legal program contains one — and the control became a fixture anyway, because an editor
holds half-written code and `[i32, i32]` should read as the tuple the author meant. It is
labelled `tuple-refused.tension` and its header carries both errors.

### 4.5 `async` / `await`: nothing added, because the corpus gives no lexical distinction

```
async functions in guests:  60 × "async function", 2 × "async main"
await uses:                 61
Promise< in guests:         0
```

The syntax is **identical** to TypeScript's — `async main` is an async function named
`main`. What differs is semantic: `async f(): i32` means the *result* type where
TypeScript demands `Promise<T>` (DL45 measured `TS1064`). A grammar carries scopes, not
types, and the brief says not to pretend otherwise. So `async`/`await` keep upstream's
`storage.modifier.async.ts` / `keyword.control.flow.ts` and the report says why, rather
than adding a `.tension` suffix that no corpus fact supports.

### 4.6 Other refusals, each measured

- **`policy`** — still an ordinary identifier (§EXT1). Not touched, again.
- **`TaskPolicy` in `extends TaskPolicy`** — scoped `entity.other.inherited-class.ts`,
  which is *correct* for a superclass. My planned assertion for it was withdrawn; that is
  the one assertion missing from the declared count, and the reason is better than the
  assertion would have been.
- **`[T * N]` as an export parameter** — refused by name: *"one WASM parameter per
  element leaf would make the extent and layout part of the host ABI"*. The fixture uses
  an `@unmanaged` pointer, as `docs/interop-c-abi.md` prescribes.
- **Nested `[[T * N] * N]` and a `[T * N]` over a GC reference, as values** — refused
  (*"a nested array needs the deep-SROA phase"*, *"a GC reference needs a write barrier"*).
  Used as `@unmanaged` views instead. Stated in the fixture header.
- **`@operator` without an argument** — `TS2554 Expected 1 arguments`. My first probe
  wrote `@operator.binary` bare; the compiler wants the symbol.
- **`@managed` on a class** — `AS212`: it is a *type* position, not a class decorator.

---

## 5. The gate

```
$ npm test
fork: syntaxes/tension.tmLanguage.json is current
[ SUCCESS ] EXT2 grammar: 10 fixtures, 48 assertions
[ SUCCESS ] EXT2 red case: 32/32 added assertions fail against upstream, 16/16 controls still pass
```

The red case, quoted in full it is 32 lines; the shape is:

```
the 32 assertions this fork adds, against upstream:
  fails as required — decorators.tension:29:2 `unmanaged` scoped as `variable.other.readwrite.ts`, expected `storage.modifier.memory.unmanaged.tension`
  fails as required — decorators.tension:33:2 `final` scoped as `variable.other.readwrite.ts`, expected `storage.modifier.final.tension`
  fails as required — no `external.js` token at decorators.tension:47 (found 0)
  fails as required — fixed-array.tension:23:19 `[` scoped as `meta.brace.square.ts`, expected `punctuation.definition.array.begin.tension`
  fails as required — fixed-array.tension:23:26 `4` scoped as `constant.numeric.decimal.ts`, expected `constant.numeric.array-length.tension`
  fails as required — rt-guards.tension:26:35 `~lib/task` scoped as `string.quoted.double.ts`, expected `string.quoted.double.import.compiler-library.tension`
  … (25 more, all failing)

the 16 control assertions, against upstream:
  all 16 pass, as they must
[ SUCCESS ] EXT2 red case: 32/32 added assertions fail against upstream, 16/16 controls still pass
```

**Two assertions were rewritten after measuring**, not argued into place:

1. the tuple control first targeted a `2` on `let pair: [i32, i32] = [1, 2];` — that `2`
   is inside the **array literal**, not the tuple type, so the assertion was asserting
   nothing about tuples. It now targets the second `i32`, which is a tuple element type.
2. the `@managed` positive first pointed at a class position, where `AS212` refuses the
   decorator; it now points at the type annotation that actually exercises the rule.

---

## 6. The package

```
$ npx @vscode/vsce package
 DONE  Packaged: /home/acakar/work/tension-vscode/tension-vscode-0.1.0.vsix (7 files, 24.42 KB)

$ ls -l tension-vscode-0.1.0.vsix
   25007 bytes

$ code --install-extension tension-vscode-0.1.0.vsix
Installing extensions...
Extension 'tension-vscode-0.1.0.vsix' was successfully installed.

$ code --list-extensions --show-versions | grep -i tension
tension.tension-vscode@0.1.0
```

The installed grammar is **byte-identical** to the tested one
(`cmp -s` against `~/.vscode-oss/extensions/tension.tension-vscode-0.1.0/syntaxes/…`), and
tokenizes correctly from its installed location:

```
23:24 * source.tension … meta.type.array.fixed.tension keyword.operator.array-length.tension
```

**One piece of state worth flagging:** the **0.0.1 directory is still on disk** beside
0.1.0 (`~/.vscode-oss/extensions/tension.tension-vscode-0.0.1`). VS Code's registry lists
only 0.1.0 and the old directory is inert, but I did not delete it — removing files from
the editor's extension directory is the user's call, not a round's.

---

## 7. Both product trees

```
~/work/Tension          main    @ cae892c   git status --porcelain → (empty)
~/work/TensionScript-a2 develop @ 368742df  git status --porcelain → (empty)
```

Only refs moved (Phase 0), plus the submodule pointer checkout, plus the `.packs/`
tarball and `node_modules` — none of which is tracked. **No file in either tree was
edited**, and the one generated file `npm install` touched (`package-lock.json`) was
reverted rather than committed.

---

## 8. What I did not verify

- **No editor window was opened.** Every claim above is about **scopes**, not pixels. I
  have not seen `@unmanaged` or `[u32 * 4]` rendered; whether a given theme has a rule for
  `storage.modifier.memory.unmanaged.tension` is unknown — most themes will fall back to
  their generic modifier colour, which is the intended behaviour and is unmeasured.
- **That VS Code loads the new grammar in a running window.** The install succeeded and
  the installed file is byte-identical, but extension activation happens inside a window.
- **The CI workflow has still never run** (no remote, by decision).
- **Windows** — the workflow matrix includes it; nothing ran there.
- **`string.quoted.single.import.compiler-library.tension`** — the rule exists and is
  symmetric with upstream's two string rules, but **no guest uses a single-quoted `~lib`
  import**, so it is untested by assertion. Stated rather than implied.
- **Deeper array nesting than two levels.** The fork handles `[[T * n] * n]`; three or
  more levels match only the innermost two, because TextMate has no balanced-bracket
  matching. No file in the corpus goes deeper.
- **The two fixtures that cannot compile** (`decorator-builtin`, `tuple-refused`) are
  asserted for scopes only; their headers carry the compiler's refusal, which is the most
  that can be said about them.
