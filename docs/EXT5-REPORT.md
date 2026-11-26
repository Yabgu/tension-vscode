# EXT5 — the compiler answers the editor

**Diagnostics, an outline and Ctrl+click, with every decidable line of it outside `vscode`.**
Green on all four CI jobs; no editor window was opened, so **no squiggle was ever seen by a
human** — that limit is §7, not a footnote.

```
~/work/tension-vscode   main @ 28f7998   version 0.3.0   clean
CI 45900976506 — 4/4 jobs green (ubuntu ×2, windows ×2)
Tension 4f7ecb8 (main, untouched) · TensionScript b55a971f (main, untouched)
```

---

## 1. Phase 0 — the six measurements, which decided the design

**(1) What the bundled compiler exports.** `dist/asc.js` — the bundle `bin/tensionscript.js`
runs — exports **15** names and **none** of `parse`, `Program`, `Module` or `DiagnosticMessage`:

```
Stats, checkDiagnostics, compileString, configToArguments, createMemoryStream, default,
defaultOptimizeLevel, defaultShrinkLevel, definitionFiles, libraryFiles, libraryPrefix,
main, options, tscOptions, version
```

`dist/assemblyscript.js` does export them (**460** names, incl. `parse`, `Program`, `Module`,
`newProgram`, `range` helpers, `nextDiagnostic`, `formatDiagnostic`). So the split is:
*programmatic API* in `assemblyscript.js`, *CLI* in `asc.js`.

**(2) Can it be required and asked to parse without the CLI?** Yes — but not *only* to
parse. `asc.main(argv, {readFile, writeFile, listFiles, stderr, reportDiagnostic})` is the
entry, with injected IO, and the smallest working snippet returns structured diagnostics.

`parse(program, text, path, isEntry)` is reachable but **not usable standalone**: it calls
`program.parser.parseFile(...)`, and `program.parser` does not exist until the program has
been initialised — which means parsing the whole std tree first, i.e. the CLI's bootstrap,
in the extension, per file. Measured: it throws `assertion failed`.

**(3) Structured diagnostics — the brief's premise does not hold.** §2.2 said "parse the
compiler's own stderr format … if only text, say so". There is a third option the brief did
not anticipate: `options.reportDiagnostic` is threaded through **all three** diagnostic
phases (`cli/index.js:773`, `:917`, `:930`) and yields

```json
{ "message": "Cannot find name 'nope'.", "code": 2304, "category": 3,
  "range": { "start": 36, "end": 40, "source": { "normalizedPath": "errprobe.ten" } },
  "relatedRange": null }
```

Byte offsets, not line/column, and it fires for parse errors as well as type errors. So:
**production spawns the CLI and parses text** (it must — the editor has no compiler module
loaded, and a 460-export bundle inside the extension host would block it); **the structured
form is the oracle in tests**, which is a stronger gate than parsing alone.

**(4) The four stderr shapes.** Committed verbatim under `tests/fixtures/diagnostics/`:

| case | fixture | what it shows |
|---|---|---|
| parse error | `e_parse` | `ERROR TS1109`, caret `^`, anchor `(2,13)` |
| type error | `b_type` | `ERROR TS2304`, caret run `~~~~`, anchor `(2,10)` |
| multi-diagnostic | `c_multi` | **two** blocks in one file, `(2,19)` and `(3,10)` |
| `~lib` misuse | `d_lib` | two blocks, both anchored **at the use site** — see the note below |
| **no anchor** | `no-anchor` | `ERROR TS6054: File 'nope.ten' not found.` — **no `in …` line** |

**The one that could not be produced:** a diagnostic whose anchor is a `~lib/…` path. Every
library misuse I could construct is reported at the *call site*: `~~lib/thread` has no
export, `Array<i32>#sort` is not generic, `Map<i32,i32>.set(1,"x")` — all anchored in the
user's file. `--lib` with a deliberately broken library file also produced a host-anchored
error. So the compiler appears to attribute to the use site, and a `~lib` anchor may not
occur at all. The parser handles it regardless (`resolveFile` leaves `~lib/…` alone rather
than pretending it is a path to open), but **I could not observe one** and the report says
so instead of implying a test.

**(5) How long a compile takes.** `~1.16–1.24 s` over three runs on a one-function guest.
Hence: 600 ms debounce (the brief's floor is 500), `checking…` in the status bar, deaths
bounded by a 20 s timeout, and a newer request kills the older child.

**(6) Definition.** `getElementByDeclaration` exists at `src/program.ts:1153`, but there is
no name→element map on the public surface, and the element graph needs the initialised
program from (2). So definition is the rung the brief proposed that does not need it: a
symbol table from the parse, resolved by name.

### The measurement that changed the code

The compiler prints anchors **relative to its own working directory**. First live run:
an absolute `-o` under `/tmp` produced `in ../../../../tmp/dbg-Qan2L0/probe.ten(2,10)` —
a path that resolves only against the cwd the child inherited, which in an extension host
is not a place a user's file is. The child's cwd is now pinned to the file's directory, so
the anchor is a bare basename, and `tests/compiler-live.mjs` asserts that specifically.

---

## 2. The three providers, and the file split that makes them testable

```
src/core/compiler.ts     discovery order, argv, spawn-with-timeout, kill    no vscode
src/core/diagnostics.ts  compiler text -> Diagnostic[] {file,line,col,…}     no vscode
src/core/symbols.ts      text -> Symbol[] {name,kind,line,col,container}     no vscode
src/core/definition.ts   (file,position) + symbols -> Location | null        no vscode
src/core/status.ts       the status bar's copy                               no vscode
src/extension.ts         glue: collections, debounce, providers              the only one
```

Gate 4, quoted:

```
$ grep -rn 'from "vscode"' src/
src/extension.ts:12:import * as vscode from "vscode";
```

`tests/core.mjs` asserts that too — over `src/core/*.ts` **and** over the compiled
`dist/core/*.js`, because a `vscode` reference that survived compilation would fail only
inside the editor, which is the failure this gate exists to catch before a user sees it.

**Discovery, in the declared order, ending in silence:** setting → `<workspace>/bin/` →
sibling `TensionScript*` → `PATH` → **nothing**. When nothing is found, `shouldCheck` is
false, the check never runs, and the item reads

```
$(warning) TensionScript: compiler not found — set `tension.compilerPath`
```

with a tooltip that lists every path tried and states the rule the silence follows. Both
strings are built in `core/status.ts` so `tests/core.mjs` can assert them — the most
important behaviour of this round is the one that shows nothing, and leaving its copy in the
glue would have made it a screenshot.

**Dropped and counted.** A block with no anchor yields no diagnostic and increments
`dropped`, which the status text prints: `2 diagnostic(s) (1 without a position, dropped)`.

**Definition** answers same-file, or `~lib/x` → `<pkg>/std/assembly/x.ts`, or null with a
named reason (`no-identifier`, `unknown-name`, `cross-file-import`, `not-in-a-checkout`)
which the glue counts and shows: `definition: 3 unresolved (last: helper — cross-file-import)`.

---

## 3. The gate, line by line

```
[ SUCCESS ] manifest: 18 checks
[ SUCCESS ] EXT4 grammar: 13 fixtures, 71 assertions
[ SUCCESS ] EXT4 red case: 50/50 added assertions fail against upstream, 21/21 controls still pass
[ SUCCESS ] EXT5 core: 107 assertions
[ SUCCESS ] EXT5 live: 10 assertions against …/bin/tensionscript.js (compiler said 2,10; parsed 2,10)
```

**The column assertion (gate 3).** The compiler's pair is **1-based line, 1-based column**.
Measured twice against the source bytes and quoted in the test beside the arithmetic:

```
line "  return nope;"       -> `nope` at 0-based index 9  -> compiler says (2,10)
line "  let x: string = a;" -> `a`    at 0-based index 18 -> compiler says (2,19)
```

and against a real compile, with the parsed result beside the compiler's own line:

```
[ SUCCESS ] EXT5 live: 10 assertions … (compiler said 2,10; parsed 2,10)
```

which also slices the source at the converted 0-based character and asserts it reads `nope`.
Every "a diagnostic exists" test in `core.mjs` would pass with the conversion wrong; this is
the one that would not.

**The negative gates**, each asserted:

| negative | asserted |
|---|---|
| compiler not found | status text quoted above, `shouldCheck` false, tooltip lists the paths |
| no-anchor block | 0 diagnostics, `dropped: 1` |
| definition miss | `null` **and** `reason: "unknown-name"` |
| cross-file import | `reason: "cross-file-import"` — labelled, not silent |
| `~lib` without a checkout | `reason: "not-in-a-checkout"` — a different fix, so a different reason |
| a string that is not a module literal | `no-identifier`, so Ctrl+click on `"hello"` goes nowhere |
| a word inside a string/comment | not an identifier (masked before scanning) |

**Package and install (gate 7):**

```
Packaged: tension-vscode-0.3.0.vsix (28 files, 74,553 bytes)
Extension 'tension-vscode-0.3.0.vsix' was successfully installed.
tension.tension-vscode@0.3.0
```

**CI (gate 8):** run **`45900976506`**, four jobs green. Each log carries
`[ SUCCESS ] EXT5 core: 107 assertions`, `[ SKIP ] EXT5 live: no compiler discoverable, so
nothing was compiled` (visible, not a silent pass), and `Packaged: … 0.3.0.vsix (28 files,
75.06 KB)`.

---

## 4. The four failures CI found that this machine did not

Every one was green locally and red on Windows, on the same commit. This is the round's
second lesson: **a gate that only runs on one host is a gate that cannot see half of what it
claims**.

1. **`Extension entrypoint(s) missing`** — all four jobs. `main` points at
   `dist/extension.js`, `dist/` is gitignored because it is generated, and the `Package`
   step ran `vsce package` on a checkout that had never built. It passed locally only
   because a local `dist/` already existed. Fixed by building before packaging.
2. **`path.join` spelled candidates `bin\tensionscript.js`** — so every discovered path
   depended on the host that built it. Fixed with one forward-slash join (`fs` accepts `/`
   on Windows).
3. **`resolve(path, "..")` returned `\work` for `/work/Tension`** — it consults the host's
   idea of a root. Parent computation is now pure string work.
4. **`path.delimiter` is the host's** — so splitting a Windows `PATH` on Linux, or a POSIX
   `PATH` on Windows, found nothing. Both separators are now written out literally; the
   first version of this fix still used the host constant and failed again.

All four are now pinned by assertions that feed **Windows spellings** on whichever host runs
the gate, so the next regression of this kind fails on Linux too.

**A fifth thing CI exposed by omission:** it never ran `npm test`. It ran
`tests/grammar.mjs` and `tests/red-case.mjs` as individual steps, so `tests/core.mjs` would
have been a test that only ran on my machine. It is now its own step — which is also how its
`107 assertions` line appears in all four logs.

---

## 5. What the compiler's API could not answer

- **No AST without the CLI bootstrap.** `parse()` needs an initialised program. A proper
  outline from the compiler would need either an exported `parseFile` that returns a
  standalone `Source` (a compiler change), or the CLI growing a `--emit-symbols <file>`
  flag that prints the declarations it parsed. Either is small; neither exists.
- **No name→element map** on the public surface, so definition cannot be compiler-backed
  even for same-file references. `getElementByDeclaration` is reachable only with the
  element graph.
- **No trace of resolution**, so a cross-file project model cannot be built from the CLI's
  output either (`cli/options.json` has no resolution trace, `--stats` is timings).

## 6. Deviations, stated rather than hidden

- **Tests import `dist/core/*.js`, not `src/core/*.ts`.** CI runs Node 20 and 22; neither
  imports TypeScript. A compile step is required either way, and testing the compiled output
  is testing what ships. `pretest` runs the build, so nothing is tested against a stale
  compile — the first CI failure is what proved that matters.
- **Three devDependencies added:** `typescript`, `@types/node`, `@types/vscode@1.70.0`
  exactly. The last is pinned because a looser range resolves to 1.146 and `vsce` then
  refuses a manifest whose `engines.vscode` is `^1.70.0`.
- **`activationEvents: ["onLanguage:tension"]`**, so the extension does not start in
  workspaces with no TensionScript file.
- The `~lib` jump needs the compiler **package root**, derived from the discovered
  `bin/tensionscript.js`. On a PATH-only install this is still correct; on a shim with no
  `bin/` beside it, `compilerRoot` stays null and the jump reports `not-in-a-checkout`.

## 7. What I did not verify

- **No editor window was ever opened.** No squiggle, no outline entry, no Ctrl+click was
  seen by a human. Everything above is asserted against `src/core/` and against a real
  compile; none of it is a screenshot, and the visual result is unmeasured.
- **The provider glue is untested.** `src/extension.ts` — the debounce, the kill of the
  previous child, the `DiagnosticCollection`, the status item, the two provider
  registrations — is typed, compiles, and is exercised only by `vsce package` and by the
  fact that the module loads. Nobody has run it in an editor.
- **No `Diagnostic` was ever rendered**, so `Range` conversion end-to-end (core's 0-based
  pair into a `vscode.Range`) is asserted in the core only.
- **The Windows install was not attempted.** The extension is installed on this host
  (`0.3.0`); WIN23's path was not reused.
- **The `~lib`-anchored diagnostic could not be produced** (§1.4).
- **Performance under real typing is unmeasured**: 600 ms debounce against a ~1.2 s compile
  means a check starts while the previous may still run; the code kills the older child, but
  nobody has watched that under a human typing cadence.
