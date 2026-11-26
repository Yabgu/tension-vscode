// **The EXT5 gate**: the extension's logic, asserted in plain Node, with no editor.
//
// This is the point of the `src/core/` split. Everything decidable — discovery order, the
// diagnostic parser, the column conversion, the symbol scan, the definition resolver —
// lives in files that import no `vscode`, so they run here. `src/extension.ts` holds only
// glue, and the assertion that it is the *only* file importing `vscode` is check 1 below.
//
//   node tests/core.mjs
//
// It imports `dist/core/*.js` — the compiled output the editor actually loads — because
// CI runs Node 20 and 22 (see .github/workflows/grammar.yml) and neither can import a
// `.ts` file. Run `npm run build` first; `npm test` does.

import assert from "node:assert";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkArgs, discoverCompiler } from "../dist/core/compiler.js";
import { parseDiagnostics, resolveFile, toRange } from "../dist/core/diagnostics.js";
import { definitionAt, importProviding, stdPath } from "../dist/core/definition.js";
import { parseSymbols, wordAt } from "../dist/core/symbols.js";
import { checkStatus, foundStatus, notFoundStatus, shouldCheck } from "../dist/core/status.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const fixtures = join(here, "fixtures", "diagnostics");

let checks = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  ++checks;
};
const eq = (actual, expected, message) => {
  assert.deepStrictEqual(actual, expected, message);
  ++checks;
};

const fixture = (name) => readFileSync(join(fixtures, `${name}.stderr.txt`), "utf8");

// ── 1. The split, asserted from the source tree ────────────────────────────────
//
// A file under `src/core/` that imports `vscode` would silently make every assertion
// below untestable, so this is checked rather than trusted.
{
  const coreDir = join(repo, "src", "core");
  const files = readdirSync(coreDir).filter((name) => name.endsWith(".ts"));
  ok(files.length >= 4, `expected the four core modules, found ${files.join(", ")}`);
  for (const file of files) {
    const text = readFileSync(join(coreDir, file), "utf8");
    ok(
      !/from\s+["']vscode["']/.test(text),
      `src/core/${file} must not import vscode — it is the file that makes the gate possible`,
    );
  }
  const extension = readFileSync(join(repo, "src", "extension.ts"), "utf8");
  ok(/from\s+["']vscode["']/.test(extension), "src/extension.ts is where vscode belongs");
}

// ── 2. Discovery: the order, and the silence at the end of it ──────────────────
{
  const nowhere = { exists: () => false, isDirectory: () => false, readdir: () => [] };

  // 2a. Nothing found is not an error object with a guess in it: it is a refusal.
  const none = discoverCompiler({ workspaceFolder: "/w", pathEnv: "/nothing/here", fs: nowhere });
  eq(none.ok, false, "no compiler anywhere must be a refusal, never a guess");
  ok(none.tried.length >= 3, `the refusal must name what was looked at, got ${none.tried.length}`);
  ok(
    none.tried.some((line) => line.includes("tension.compilerPath")),
    "the refusal must name the setting that fixes it",
  );

  // 2b. The setting wins, even over a workspace compiler: a user who names one has said
  //     which compiler they mean.
  const both = discoverCompiler({
    settingPath: "/opt/ts/bin/tensionscript.js",
    workspaceFolder: "/w",
    pathEnv: "",
    fs: {
      exists: (p) => p === "/opt/ts/bin/tensionscript.js" || p === "/w/bin/tensionscript.js",
      isDirectory: () => false,
      readdir: () => [],
    },
  });
  ok(both.ok, "the setting must resolve when it names a real file");
  eq(both.via, "setting", "the setting outranks the workspace");

  // 2c. The workspace's own `bin/` is second.
  const wsOnly = discoverCompiler({
    workspaceFolder: "/w",
    pathEnv: "",
    fs: {
      exists: (p) => p === "/w/bin/tensionscript.js",
      isDirectory: () => false,
      readdir: () => [],
    },
  });
  ok(wsOnly.ok, "a workspace compiler must be found");
  eq(wsOnly.via, "workspace-bin", "the workspace outranks PATH");

  // 2d. A sibling checkout named `TensionScript-a2` — this project's own layout, and the
  //     reason the pattern has a `*` in it.
  const sibling = discoverCompiler({
    workspaceFolder: "/work/Tension",
    pathEnv: "",
    fs: {
      exists: (p) => p === "/work/TensionScript-a2/bin/tensionscript.js",
      isDirectory: () => false,
      readdir: (p) => (p === "/work" ? ["Tension", "TensionScript-a2", "other"] : []),
    },
  });
  ok(sibling.ok, "a sibling TensionScript* checkout must be found");
  eq(sibling.via, "sibling-checkout", "the sibling rung");

  // 2e. PATH last, and only for an exact name.
  const viaPath = discoverCompiler({
    // This case is about POSIX PATH splitting, so it says so rather than inheriting the
    // host's platform — otherwise it asserts a colon-split on a machine whose PATH
    // separator is a semicolon, which is how it failed on Windows CI.
    isWindows: false,
    pathEnv: "/usr/local/bin:/opt/bin",
    fs: {
      exists: (p) => p === "/opt/bin/tensionscript",
      isDirectory: () => false,
      readdir: () => [],
    },
  });
  ok(viaPath.ok, "PATH is the last rung and must still work");
  eq(viaPath.via, "path", "PATH is last");

  // 2e-bis. **Windows spellings, on whatever host runs this test.** Two defects lived
  //     here and both were found by CI on Windows only, with Linux green on the same
  //     commit: `path.join` spelled candidates `bin\\tensionscript.js`, and
  //     `path.delimiter` is `:` on POSIX — which turns a Windows PATH into `C`, `\\tools;D`.
  //     These assertions pin the platform-independent answer so neither can come back.
  {
    const winFs = {
      exists: (p) => p === "C:/work/TensionScript-a2/bin/tensionscript.js",
      isDirectory: () => false,
      readdir: (p) => (p === "C:/work" ? ["Tension", "TensionScript-a2"] : []),
    };
    const winWorkspace = discoverCompiler({
      workspaceFolder: "C:\\work\\Tension",
      pathEnv: "",
      isWindows: true,
      fs: winFs,
    });
    ok(winWorkspace.ok, "a backslash-spelled workspace must find its sibling");
    eq(winWorkspace.path, "C:/work/TensionScript-a2/bin/tensionscript.js", "one spelling, both platforms");

    const winPath = discoverCompiler({
      workspaceFolder: "C:/work/Tension",
      pathEnv: "C:\\tools;D:\\bin",
      isWindows: true,
      fs: {
        exists: (p) => p === "C:/tools/tensionscript.cmd",
        isDirectory: () => false,
        readdir: () => [],
      },
    });
    ok(winPath.ok, "a semicolon PATH must be split on semicolons, not on ':'");
    eq(winPath.path, "C:/tools/tensionscript.cmd", "and the .cmd suffix is tried");
  }

  // 2f. The flags are the project's, read from its own build scripts — not invented.
  const args = checkArgs("game.ten", "/tmp/out.wasm");
  ok(args.includes("--runtime") && args.includes("incremental"), "--runtime incremental");
  ok(args.includes("--target") && args.includes("release"), "--target release");
  ok(args.includes("--optimizeLevel") && args[args.indexOf("--optimizeLevel") + 1] === "0", "-O0");
  ok(args.includes("--noColors"), "--noColors keeps the output parseable");
}

// ── 3. The diagnostic parser, against the compiler's own four shapes ────────────
{
  // 3a. A parse error.
  const parse = parseDiagnostics(fixture("e_parse"));
  eq(parse.diagnostics.length, 1, "one parse error");
  eq(parse.blocks, 1, "one block");
  eq(parse.dropped, 0, "nothing dropped");
  const d = parse.diagnostics[0];
  eq(d.code, "TS1109", "the code survives");
  eq(d.severity, "error", "ERROR is an error");
  eq(d.file, "e_parse.ten", "the file is the anchor's");
  eq(d.message, "Expression expected.", "the message has no code prefix left on it");

  // 3b. **The column convention.** The compiler prints **1-based line, 1-based column**;
  //     measured twice against the source bytes and quoted here so the arithmetic is
  //     checkable without re-running a compile:
  //
  //       line "  return nope;"      -> `nope` at 0-based index 9  -> compiler says (2,10)
  //       line "  let x: string = a;"-> `a`    at 0-based index 18 -> compiler says (2,19)
  //
  //     This assertion is the one that catches an off-by-one: every other diagnostic test
  //     below passes just as well if the conversion is wrong.
  {
    const type = parseDiagnostics(fixture("b_type"));
    eq(type.diagnostics.length, 1, "one type error");
    const error = type.diagnostics[0];
    eq([error.line, error.column], [2, 10], "the compiler's own (line,col) for `nope`");
    const source = "export function f(): i32 {\n  return nope;\n}\n".split("\n")[1];
    eq(source.slice(error.column - 1, error.column - 1 + 4), "nope", "1-based column points at the name");
    const range = toRange(error);
    eq(range.startLine, 1, "VS Code's line is 0-based");
    eq(range.startCharacter, 9, "VS Code's character is 0-based: the same index the slice used");
    eq(source.slice(range.startCharacter, range.endCharacter), "nope", "the range covers the name");
  }

  // 3c. A file with **two** diagnostics — the multi-diagnostic case.
  {
    const multi = parseDiagnostics(fixture("c_multi"));
    eq(multi.diagnostics.length, 2, "two diagnostics in one file");
    eq(
      multi.diagnostics.map((x) => x.code),
      ["TS2322", "TS2322"],
      "both keep their code",
    );
    eq(
      multi.diagnostics.map((x) => [x.line, x.column]),
      [
        [2, 19],
        [3, 10],
      ],
      "each carries its own anchor",
    );
    ok(
      multi.diagnostics[1].line > multi.diagnostics[0].line,
      "the order follows the source, which is what an editor shows",
    );
  }

  // 3d. A diagnostic against a `~lib/` import: the anchor is the *user's* file, which is
  //     the only place it could be — see the round report for the case that could not be
  //     produced.
  {
    const lib = parseDiagnostics(fixture("d_lib"));
    eq(lib.diagnostics.length, 2, "the library misuse gives two, both at use sites");
    ok(
      lib.diagnostics.every((x) => x.file === "d_lib.ten"),
      "every anchor names the file the user edited",
    );
    ok(
      lib.diagnostics[0].message.includes("~lib/thread"),
      "the message keeps the compiler's own spelling of the library",
    );
  }

  // 3e. **No anchor: dropped and counted, never given a position.**
  {
    const none = parseDiagnostics(fixture("no-anchor"));
    eq(none.blocks, 1, "the block exists");
    eq(none.diagnostics.length, 0, "and produces no diagnostic, because it has no position");
    eq(none.dropped, 1, "it is counted, so a reader can see something was dropped");
  }

  // 3f. Decoration the parser must tolerate: a block with no caret run still gets a
  //     one-character span rather than a zero-width one nobody can see.
  {
    const synthetic = "ERROR TS9999: no caret here\n  └─ in x.ten(3,5)\n";
    const one = parseDiagnostics(synthetic);
    eq(one.diagnostics.length, 1, "an anchor alone is enough");
    eq(one.diagnostics[0].length, 1, "a missing caret run means a 1-character span");
  }

  // 3g. The `FAILURE` summary is not a diagnostic, and neither is chatter.
  {
    ok(!parseDiagnostics("FAILURE 2 compile error(s)\n").diagnostics.length, "the summary is not a diagnostic");
    ok(!parseDiagnostics("").diagnostics.length, "empty input is empty output");
  }

  // 3h. Paths resolve against the compile's cwd, and `~lib/` is left alone so nothing
  //     tries to open a file that is not on disk.
  {
    eq(resolveFile("a/b.ten", "/w"), "/w/a/b.ten", "a relative anchor resolves");
    eq(resolveFile("~lib/task", "/w"), "~lib/task", "a library path is not a file to open");
    eq(resolveFile("C:\\\\x\\\\y.ten", "/w"), "C:\\\\x\\\\y.ten", "a Windows absolute path is left alone");
  }
}

// ── 4. The symbol scan (the outline) ──────────────────────────────────────────
{
  const text = [
    "// a comment with { braces and \"strings\"",
    "@external export function hostCall(x: i32): void {}",
    "export async function later(): i32 { return 1; }",
    "export class Widget extends Base {",
    "  x: f32 = 0;",
    "  draw(): void {",
    "    return;",
    "  }",
    "}",
    "export struct Vec3 { x: f32; y: f32; }",
    "export interface Shape { area(): f64; }",
    "export enum Mode { A, B }",
    "export namespace inner { }",
    "function hidden(): void {}",
    "",
  ].join("\n");
  const symbols = parseSymbols(text);
  const byName = new Map(symbols.map((s) => [s.name, s]));

  eq(byName.get("hostCall").kind, "function", "a decorated export is a function");
  eq(byName.get("hostCall").decorators, ["external"], "and carries its decorator");
  eq(byName.get("later").kind, "function", "async is a modifier, not a kind");
  eq(byName.get("Widget").kind, "class", "a class");
  eq(byName.get("Widget").exported, true, "export is recorded");
  eq(byName.get("Vec3").kind, "struct", "a struct — EXT4's blind spot, here by name");
  eq(byName.get("Shape").kind, "interface", "an interface");
  eq(byName.get("Mode").kind, "enum", "an enum");
  eq(byName.get("inner").kind, "namespace", "a namespace");
  eq(byName.get("hidden").exported, false, "a non-exported function is still a symbol");

  eq(byName.get("x")?.container, "Widget", "a class field belongs to its class");
  eq(byName.get("x")?.kind, "field", "and is a field");
  eq(byName.get("draw")?.container, "Widget", "a method belongs to its class");
  eq(byName.get("draw")?.kind, "method", "and is a method");

  // The comment's `{` and the `"strings"` must not have shifted the brace depth, or the
  // members above would be attributed to nothing.
  ok(
    symbols.filter((s) => s.container === "Widget").length === 2,
    `Widget must own exactly field+method, got ${symbols.filter((s) => s.container === "Widget").length}`,
  );

  // Positions are 1-based and point at the *name*, not at `export`.
  eq(byName.get("Vec3").line, 10, "the struct's line");
  eq(text.split("\n")[9].slice(byName.get("Vec3").column - 1, byName.get("Vec3").column - 1 + 4), "Vec3", "the column names it");

  // `wordAt` is the definition provider's input; it must agree with the same convention.
  const word = wordAt("  return nope;", 0, 11);
  eq(word.word, "nope", "the word under the cursor");
  eq([word.column, word.length], [10, 4], "1-based column and the name's length");
  eq(wordAt("{}", 0, 0), null, "no identifier here");
}

// ── 5. Definition: three cases, one of them a miss ────────────────────────────
{
  const text = [
    'import { taskSleep } from "~lib/thread";',
    "export function helper(): i32 { return 1; }",
    "export function caller(): i32 {",
    "  return helper();",
    "}",
    "",
  ].join("\n");
  const file = "/w/probe.ten";
  const noFs = () => false;

  // 5a. Same file.
  const same = definitionAt({ file, text, line: 3, character: 10, compilerRoot: null, exists: noFs });
  ok(same.location !== null, "a same-file call resolves");
  eq(same.location.file, file, "to this file");
  eq(same.location.line, 1, "to the declaration's line (0-based)");
  eq(same.location.via, "same-file", "via the outline");

  // 5b. `~lib/` — a real jump into the compiler's own std, which is on disk.
  const libRoot = join(repo, "tests", "fixtures", "fakestd");
  const lib = definitionAt({
    file,
    text,
    line: 0,
    character: 12,
    compilerRoot: libRoot,
    exists: (p) => p === stdPath(libRoot, "thread"),
  });
  ok(lib.location !== null, "an imported ~lib name resolves when the std file exists");
  eq(lib.location.file, stdPath(libRoot, "thread"), "to <pkg>/std/assembly/thread.ts");
  eq(lib.location.via, "compiler-std", "via the compiler's std");

  // 5c. The miss. It returns null **and says why**, which is what the status count needs.
  const miss = definitionAt({
    file,
    text: "export function caller(): i32 {\n  return missing();\n}\n",
    line: 1,
    character: 10,
    compilerRoot: null,
    exists: noFs,
  });
  eq(miss.location, null, "an unknown name goes nowhere");
  eq(miss.reason, "unknown-name", "and says why");

  // 5d. A cross-file import is a *named* miss, not a silent one: EXT6 owns it.
  const cross = definitionAt({
    file,
    text: 'import { thing } from "./sibling";\nexport function f(): void { thing(); }\n',
    line: 0,
    character: 22,
    compilerRoot: null,
    exists: noFs,
  });
  eq(cross.reason, "cross-file-import", "a relative import is EXT6's, and is labelled so");

  // 5e. Without a checkout the `~lib` jump cannot be made — and that is a different miss
  //     from "unknown name", because the fix is different (open the compiler checkout).
  const noRoot = definitionAt({
    file,
    text: 'import { taskSleep } from "~lib/thread";\n',
    line: 0,
    character: 30, // inside the quoted specifier
    compilerRoot: null,
    exists: noFs,
  });
  eq(noRoot.reason, "not-in-a-checkout", "the reason names the missing checkout");

  // 5g. A string that is not a module literal is not a jump target — the guard that stops
  //     Ctrl+click on "hello" claiming to be a cross-file reference.
  const data = definitionAt({
    file,
    text: 'export function f(): void { print("~lib/thread"); }\n',
    line: 0,
    character: 40,
    compilerRoot: null,
    exists: noFs,
  });
  eq(data.reason, "no-identifier", "a string in an expression is data, not a specifier");

  // 5f. The import helper itself, so a wrong `importProviding` cannot pass 5b by luck.
  eq(importProviding(text, "taskSleep"), "thread", "the providing module");
  eq(importProviding(text, "helper"), null, "a local name has no library");
}

// ── 6. The "compiler not found" path — the one that must show nothing ──────────
//
// EXT5 §2.1's last rung. This is the round's most important negative behaviour, so its
// exact copy is asserted here rather than left to a screenshot.
{
  const nowhere = { exists: () => false, isDirectory: () => false, readdir: () => [] };
  const missing = discoverCompiler({ workspaceFolder: "/w", pathEnv: "/nope", fs: nowhere });
  eq(missing.ok, false, "no compiler");
  eq(shouldCheck(missing), false, "and therefore no check is started at all");

  const item = notFoundStatus(missing);
  eq(
    item.text,
    "$(warning) TensionScript: compiler not found — set `tension.compilerPath`",
    "the status text names the setting",
  );
  ok(item.tooltip.includes("no diagnostics are shown"), "the tooltip says nothing is shown");
  ok(
    item.tooltip.includes("A wrong squiggle under correct code is worse than none"),
    "and states the rule the silence follows",
  );
  ok(item.tooltip.includes("/w/bin/tensionscript.js"), "and lists what was looked at");

  // The positive half, so the pair of items is checked rather than one of them.
  const found = discoverCompiler({
    workspaceFolder: "/w",
    pathEnv: "",
    fs: { exists: (p) => p === "/w/bin/tensionscript.js", isDirectory: () => false, readdir: () => [] },
  });
  ok(shouldCheck(found), "a found compiler means checks run");
  ok(foundStatus(found).tooltip.includes("/w/bin/tensionscript.js"), "the found item names the path");

  // The check summary counts a dropped diagnostic in its own words, so a reader can see
  // that something was lost rather than only what survived.
  const summary = checkStatus({ blocks: 3, kept: 2, dropped: 1, timedOut: false });
  eq(summary.text, "$(check) TensionScript: 2 diagnostic(s) (1 without a position, dropped)", "dropped is counted");
  eq(checkStatus({ blocks: 0, kept: 0, dropped: 0, timedOut: false }).text, "$(check) TensionScript: no diagnostics", "a clean file");
  eq(checkStatus({ blocks: 0, kept: 0, dropped: 0, timedOut: true }).text, "$(warning) TensionScript: check timed out", "a hang is its own state");
}

// ── 7. Nothing in `dist/core/` reached for `vscode` either ─────────────────────
//
// The compiled output is what the editor loads; a `vscode` reference that survived
// compilation would fail at runtime only inside VS Code, which is the failure this gate
// exists to catch before a user sees it.
{
  const dist = join(repo, "dist", "core");
  for (const file of readdirSync(dist).filter((name) => name.endsWith(".js"))) {
    const text = readFileSync(join(dist, file), "utf8");
    ok(!/require\(["']vscode["']\)/.test(text), `dist/core/${file} must not require vscode`);
  }
  ok(statSync(dist).isDirectory(), "the compiled core exists");
}

console.log(`[ SUCCESS ] EXT5 core: ${checks} assertions`);
