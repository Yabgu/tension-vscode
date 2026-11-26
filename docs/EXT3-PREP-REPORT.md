# EXT3-prep — two ordered decisions that went stale

| | |
|---|---|
| `~/work/TensionScript-a2` | `develop` @ **`113fdd24`**, clean, **pushed** (`368742df..113fdd24`) |
| `~/work/Tension` | `feat/dl46-ten-canonical` @ **`57f045c`**, clean, **not pushed**; `main` @ `cae892c` **untouched** |
| `~/work/tension-vscode` | `main` @ **`d82cbd9`** (this report is the commit after), **pushed** |
| Phase A gate | notice says **`.ten`**; `tests/cli/guest-extension.js` **5 checks** |
| Phase B gate | **`45882136079` — 4 of 4 jobs green**, both Windows jobs included |
| `--check` | **9/9**; identity `f97c0f03b334` → **`33fc8a03cc1b`**; guests row reads **`.ten`** |
| suites | threads 15 · fiber 6 · fiber-executor 7 · fiber-runner 5 · async_on_main 2 · async_main_promise 2 · debugger 5 · `--bin` 307/298 |

Both fixes are one line in the meaningful sense: one array literal, one `.gitattributes`.
Everything else below is the evidence that they were the right lines.

---

## 1. Phase A — the table's order

### 1.1 Before and after

```js
const ENTRY_EXTENSIONS = [".tension", ".ten", ".ts"];     // before  (DL45's choice)
const ENTRY_EXTENSIONS = [".ten", ".tension", ".ts"];     // after   (DL46's decision)
```

The comment above it said "`.tension` is canonical, `.ten` is the short spelling" — a
description of the design that had been decided against, which is exactly the kind of
comment a later round trusts and inherits. Rewritten to say `.ten` is canonical and, more
usefully, **why the order matters at all**.

### 1.2 Every reader, and whether it depends on order

Five readers. **Two depend on order, and both want canonical-first** — so a reorder is the
right change rather than a different one:

| reader | line | depends on order? | verdict |
|---|---|---|---|
| `ENTRY_EXTENSIONS[0]` in the deprecation notice | 803 | **yes** | this is the fix: it is what a user is told to rename to |
| candidate search (`stem + ext`, then `stem/index.ext`) | 782-790 | **yes** | tries the table in order, so the canonical spelling wins when a stem exists under more than one. Canonical-first **is** the intent |
| `entryExtensionOf(path)` | 80-84 | no — verified | each path matches exactly one extension, so the loop's order cannot matter |
| `ENTRY_EXTENSIONS.includes(...)` for acceptance | 765 | no | set membership |
| `ENTRY_EXTENSIONS.join(", ")` in the refusal | 768 | cosmetically | the "Accepted:" list follows the table by construction; it now reads `.ten, .tension, .ts` |

The order-independence of `entryExtensionOf` is measured, not reasoned — `.tension` and
`.ten` share a prefix, so a `startsWith` would have been ambiguous:

```
a.tension    matches: [".tension"]   unique
a.ten        matches: [".ten"]       unique
a.ts         matches: [".ts"]        unique
```

### 1.3 The notice, before and after, from a real compile

Before — the installed compiler (`f97c0f03b334`), a `.ts` probe with
`--warn-deprecated-extension`:

```
WARNING: 'probe.ts' uses the deprecated guest extension '.ts'. Rename it to '.tension' — the compiler accepts it now and will not forever.
FAILURE Guest source 'probe.code' has the extension '.code', which is not one this compiler accepts. Accepted: .tension, .ten, .ts (.ts is deprecated).
```

After — the rebuilt tree (`dist/asc.js` `509fa41a3366`):

```
WARNING: 'probe.ts' uses the deprecated guest extension '.ts'. Rename it to '.ten' — the compiler accepts it now and will not forever.
FAILURE Guest source 'probe.code' has the extension '.code', which is not one this compiler accepts. Accepted: .ten, .tension, .ts (.ts is deprecated).
```

Only the spelling changed; the sentence, the refusal, and every accepted extension are
untouched (brief §4).

### 1.4 The CLI test: two assertions pinned the old order — a finding, reported

The brief predicted this and called it a finding rather than a licence. Two assertions
hard-coded the stale order, and both failed after the change:

```
AssertionError: the refusal must list what is accepted
  expected: /\.tension, \.ten, \.ts/
  actual:   "… Accepted: .ten, .tension, .ts (.ts is deprecated)."
```

| assertion | old expected | new expected | relaxed? |
|---|---|---|---|
| the refusal lists what is accepted | `/\.tension, \.ten, \.ts/` | `/\.ten, \.tension, \.ts/` | **no** — still an exact literal over the whole list, so a missing or reordered spelling still fails |
| the notice names the replacement | `/Rename it to '\.tension'/` | `/Rename it to '\.ten'/` | **no, strengthened** — a `doesNotMatch(/Rename it to '\.tension'/)` was added, so a regression back is caught too |

Their expected values legitimately changed because the compiler's message legitimately
changed; that is not a relaxation, and the discrimination was verified by running the new
literals against the old strings:

```
list literal vs OLD message: FAIL (as it must)      rename literal vs OLD notice: FAIL (as it must)
list literal vs NEW message: PASS                   "must not say .tension" vs OLD notice: FAIL (as it must)
                                                    rename literal vs NEW notice: PASS
```

Result: **`[ SUCCESS ] guest-extension: 5 checks`**, unchanged count.

---

## 2. Phase B — line endings, and the failure that was only on Windows

### 2.1 The failure, from CI

Run **`45881297051`** (the commit before this round), per job:

```
Grammar (ubuntu-latest, node 22):     success
Grammar (windows-latest, node 22):    failure
Grammar (ubuntu-latest, node 20):     success
Grammar (windows-latest, node 20):    failure
```

both Windows failures at the same step:

```
fork: syntaxes/tension.tmLanguage.json is stale — run `node tools/fork.mjs`
```

### 2.2 Reproduced on Linux, so the cause is measured rather than assumed

`git -c core.autocrlf=true clone` is what a Windows runner effectively does:

```
i/lf    w/crlf  attr/     package.json
i/lf    w/crlf  attr/     syntaxes/tension.tmLanguage.json      CR bytes in the file: 1
$ node tools/fork.mjs --check
fork: syntaxes/tension.tmLanguage.json is stale — run `node tools/fork.mjs`     exit 1
```

**One** CR byte, because the grammar is a single line of JSON — the comparison is
byte-exact and `JSON.stringify` writes `\n` on every platform, so one converted newline is
enough.

### 2.3 What the CRLF checkout did **not** break

`Assertions` was **skipped** on those jobs (it comes after the failing step), so the
question "would the rest have passed?" was never answered by CI. Measured locally on the
CRLF checkout: **`[ SUCCESS ] EXT2 grammar: 10 fixtures, 48 assertions`** — the tokenizer
splits on `/\r\n|\n|\r/`, so line numbers and columns are identical. The defect was
confined to the one step that compares bytes, and that is worth stating: a CRLF checkout
is not a broken repository, it is a broken *byte comparison*.

### 2.4 The fix, as committed

`.gitattributes`, whose every line states why it is there:

```gitattributes
* text=auto eol=lf

*.tmLanguage.json text eol=lf     # the file the gate compares byte for byte
*.json            text eol=lf     # manifests, language-configuration, lock
*.tension text eol=lf             # fixtures are copies of guests from the Tension tree
*.ten     text eol=lf
*.md *.mjs *.js *.yml text eol=lf # covered by the blanket rule; listed for legibility
*.vsix binary
*.png  binary
```

`* text=auto eol=lf` is the load-bearing line; the explicit rules name the paths whose
bytes a gate reads, so a future reader does not have to infer that from `text=auto`. The
rule mirrors the one the Tension product repository already carries
(`* text=auto eol=lf` plus explicit `eol=lf` for JSON), so a file copied between the two
trees has the same bytes on both sides.

**Renormalisation: nothing to renormalise.**

```
$ git add .gitattributes && git add --renormalize .
$ git diff --stat
(.gitattributes only — no line-ending changes)
```

Every tracked file was already LF in the index. Three JSON files report `i/none` — they are
single-line documents with no newline at all, which git reports as "no EOL" rather than
"LF"; there is nothing in them to convert. So the answer to "empty, or only line-ending
changes" is: **empty apart from the new file.**

### 2.5 `git ls-files --eol`, after

```
i/lf    w/lf    attr/text=auto eol=lf   .gitattributes
i/none  w/none  attr/text eol=lf        language-configuration.json
i/lf    w/lf    attr/text eol=lf        package.json
i/lf    w/lf    attr/text eol=lf        syntaxes/tension.tmLanguage.json
i/none  w/none  attr/text eol=lf        vendor/TypeScript.upstream.tmLanguage.json
i/none  w/none  attr/text eol=lf        vendor/language-configuration.upstream.json
```

### 2.6 Verified on the same simulated-Windows clone

```
i/lf  w/lf  attr/text eol=lf   package.json
i/lf  w/lf  attr/text eol=lf   syntaxes/tension.tmLanguage.json      CR bytes in the file: 0
$ node tools/fork.mjs --check
fork: syntaxes/tension.tmLanguage.json is current          exit 0
```

and the whole gate in that checkout: `fork … is current` · `[ SUCCESS ] EXT2 grammar: 10
fixtures, 48 assertions` · `[ SUCCESS ] EXT2 red case: 32/32 added assertions fail against
upstream, 16/16 controls still pass`.

### 2.7 The gate was not weakened

In the same checkout, tampering with the grammar:

```
$ (name -> "TensionScriptTAMPERED")
$ node tools/fork.mjs --check
fork: syntaxes/tension.tmLanguage.json is stale — run `node tools/fork.mjs`     exit 1
```

### 2.8 CI, after the push

**Run `45882136079`** — `main` @ `d82cbd9`:

```
Grammar (ubuntu-latest, node 20):  success
Grammar (ubuntu-latest, node 22):  success
Grammar (windows-latest, node 20): success
Grammar (windows-latest, node 22): success
```

and the Windows job's own log, so "green" is not a claim about an absence of information:

```
Grammar (windows-latest, node 22)  The grammar is generated, not hand-edited
  fork: syntaxes/tension.tmLanguage.json is current
```

---

## 3. Phase A's consequences: identity, rebuild, and one thing the brief did not anticipate

### 3.1 The identity moved, as declared

`cli/index.js` is inside `dist/asc.js`, so:

| | before | after |
|---|---|---|
| src → `dist/assemblyscript.js` | `800f07d27523` | **`ca525a90c49b`** |
| identity (bundles) | `f97c0f03b334` | **`33fc8a03cc1b`** |

### 3.2 `--check` 9/9 required a re-vendor, because of what the row compares

The brief says "re-vendor is **NOT** required for a Windows build this round" *and* that
"`--check` on Linux must be 9/9 after the rebuild". Those two cannot both hold as written,
and the reason is the row's definition:

```js
const COMPILER_DIR = TENSIONSCRIPT_DIR;
const INSTALLED    = join(REPO, 'node_modules', ...PACKAGE.split('/'));   // ← Tension's
```

`compiler: dist → installed` compares the **TensionScript tree** against **Tension's
node_modules**. After the rebuild:

```
compiler: dist → installed    33fc8a03cc1b (tree)    f97c0f03b334 (installed)    STALE
```

So 9/9 is only reachable by installing the new compiler into Tension, which is a re-vendor.
I read the brief's "not required" as scoped to Windows (the parenthetical says "for a
Windows build"), did the re-vendor on Linux, and am naming it here because it is a Tension
commit in a round whose phases did not mention Tension:

```
tarball  .packs/yabgu_gm-tensionscript-0.14.1-g113fdd2486a2.tar (25.10 MB)
identity f97c0f03b334 -> 33fc8a03cc1b
```

It is committed on `feat/dl46-ten-canonical` (not `main`), so `main` stays at `cae892c` and
the tree is clean. **If the seat would rather Tension stayed untouched, this is the one
commit to drop** — and then `--check` reads 8/9 with the row above, which is the honest
state rather than a failure of the fix.

### 3.3 The rebuild: 70 records rewritten, **0 bytes moved**

The chain rebuilt everything for the new compiler, by identity alone (no guest source
touched):

```
build-test-programs: 35 built, 0 up to date, 35 total (35 for a new compiler)
release: 35 compared, 0 bytes moved
debug:   35 compared, 0 bytes moved
```

That is the expected shape and now a measured fact: the change reaches the candidate search
(no guest is built from a bare stem, so nothing changes there) and the deprecation notice
(stderr only). **No artifact byte moved**, which also means the committed fixtures needed no
refresh.

### 3.4 `--check` at the tip

```
compiler: src → dist/assemblyscript.js        159 inputs → ca525a90c49b     recorded ca525a90c49b           PASS
compiler: dist → installed                    33fc8a03cc1b (tree)           33fc8a03cc1b (installed)        PASS
compiler: std mirror (no compile reads it)    81 files identical            81 identical                    PASS
runtime: src → release                        84 inputs → ff87421e5d2b      recorded ff87421e5d2b           PASS
runtime: src → debug                          84 inputs → ff87421e5d2b      recorded ff87421e5d2b           PASS
fixtures: committed .wasm                     15 present, none behind its…  15 present, all current         PASS
guests: tests/programs/**/*.ten → build/*.w…  35 built after source         35 current                      PASS
guests: built by the installed compiler       70 recorded by 33fc8a03cc1b   70 of 70 current                PASS
docs: docs/abi/*.md                           generator --check clean       current                         PASS

rebuild: 9/9 links PASS
```

### 3.5 Suites, from their own lines

```
threads              test result: ok. 15 passed; 0 failed; 0 ignored
fiber                test result: ok. 6 passed; 0 failed; 0 ignored
fiber-executor       test result: ok. 7 passed; 0 failed; 0 ignored
fiber-runner         test result: ok. 5 passed; 0 failed; 0 ignored
async_on_main        test result: ok. 2 passed; 0 failed; 0 ignored
async_main_promise   test result: ok. 2 passed; 0 failed; 0 ignored
debugger             test result: ok. 5 passed; 0 failed; 0 ignored
--bin (default)      test result: ok. 307 passed; 0 failed; 0 ignored
--bin (audio)        test result: ok. 298 passed; 0 failed; 0 ignored
```

All at their declared counts; no change is a finding.

### 3.6 CI on the TensionScript push

**Run `45882016698`** — `develop` @ `113fdd24`, **16 jobs, all success**, including
`Gate 4 (threads)` and `Coverage`, and the CLI test ran there:

```
Coverage       Collect coverage   [ SUCCESS ] guest-extension: 5 checks
Compiler (macos, node lts/*)      [ SUCCESS ] guest-extension: 5 checks
```

**A pre-existing failure, named so it is not mistaken for this round's:** run
`45865756544` on `develop` @ `368742df` — the commit *before* this work — failed its
`Coverage` job. That is the DL45 report's heap finding, and it passed here, so it is
intermittent rather than caused by the table reorder.

---

## 4. Anything that would have made this round unnecessary

The brief frames the defect as "`ENTRY_EXTENSIONS[0]` is quoted in the notice". The tree is
more specific, and it is the answer to this question:

**The list's order was *already* load-bearing for resolution, not just for the message.**
`entryExtensionOf` does not depend on it, but the candidate search does — it builds its
search list by walking the table, so `.tension` was preferred over `.ten` when a stem
existed under both spellings. In other words the table already *was* the canonical
declaration, in a place where the order had a functional effect; DL46 reordered the same
table in the *Tension* repo (`scripts/lib/guest-extensions.mjs`, `[".ten", ".tension",
".ts"]`) and did not notice that the compiler carries a second copy whose order means the
same thing and is read by one more consumer.

So: had DL46 reordered both tables in the same commit — or had the two copies been one file
— this round would have been a one-line diff inside a round that was already touching the
subject. The lesson worth keeping is that a list encoding a decision has to be found by
grep when the decision changes, and `ENTRY_EXTENSIONS` was found by grep in DL45 but only
for its *content* (`accepts .ten`), not its *order*.

For Phase B: the Tension repo has carried `* text=auto eol=lf` since long before this
extension existed, so the rule was available to copy on day one. A repository that produces
generated files compared byte-for-byte needs that line before its first CI run, not after
its first Windows failure.

---

## 5. Commits

```
TensionScript-a2 113fdd24  cli: the table's order is the canonical declaration, so .ten comes first
Tension           57f045c vendor: the compiler at 113fdd24, whose notice names .ten
tension-vscode    d82cbd9 repo: LF in every checkout, so the grammar comparison means the same thing on Windows
```

TensionScript `develop` @ `113fdd24` (pushed; `main` untouched at `368742df`).
Tension `feat/dl46-ten-canonical` @ `57f045c` (not pushed; `main` untouched at `cae892c`).
tension-vscode `main` @ `d82cbd9` (pushed; nothing force-pushed anywhere).

## 6. What I did not verify

- **No Windows machine was used.** Phase B's evidence is the *real* CI run
  (`45882136079`, both Windows jobs green, with the log line quoted) plus a local
  simulation with `core.autocrlf=true`. I did not run `npm test` on Windows myself.
- **The conformance census was not re-run.** The `debugger` suite passes (5), which covers
  the lldb path the census also exercises, but the 82-case census is not part of this
  round's gate and takes ~10 minutes; I did not spend it.
- **No editor window was opened** — unchanged from EXT1/EXT2; `.ten` opening as
  TensionScript still rests on the manifest, not on a running window.
- **The notice was read from a `.ts` probe only.** `.tension` and `.ten` entries print
  nothing by design (`--warn-deprecated-extension` fires for `.ts` alone), so "the notice
  names `.ten`" is verified for the only case that produces a notice.
- **The Tension re-vendor's effect on a Windows build** — the brief says it is not required
  for one, and I did not test it; the Windows tree is behind anyway (WIN23).
- **The pre-existing `Coverage` flakiness** is described, not diagnosed. It failed on
  `develop` at `368742df` and passed at `113fdd24`; nothing in this round's diff plausibly
  affects it, and I did not investigate further.
