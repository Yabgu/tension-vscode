// **The live check**: the parser against a real compile, not against a saved string.
//
// `tests/core.mjs` asserts the parser on committed fixtures, which proves it agrees with
// itself. This proves it agrees with **the compiler**: it runs the real CLI on a file whose
// error position is known, and compares the parsed result with the `in <file>(<line>,<col>)`
// line the compiler printed beside it.
//
// It **skips** when no compiler is discoverable — CI has none — and says so, so a skip is
// visible rather than being a green line over nothing.
//
//   node tests/compiler-live.mjs

import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkArgs, discoverCompiler, runCompiler } from "../dist/core/compiler.js";
import { parseDiagnostics, toRange } from "../dist/core/diagnostics.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");

let checks = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  ++checks;
};

const found = discoverCompiler({
  workspaceFolder: resolve(repo, "..", "Tension"),
  pathEnv: process.env.PATH ?? "",
});
if (!found.ok) {
  console.log("[ SKIP ] EXT5 live: no compiler discoverable, so nothing was compiled");
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "ext5-live-"));
try {
  // `nope` sits at 1-based column 10 of line 2. That number is the compiler's, checked
  // against the source text below rather than typed from memory.
  const SOURCE = "export function f(): i32 {\n  return nope;\n}\n";
  writeFileSync(join(dir, "probe.ten"), SOURCE);

  const result = await runCompiler(
    process.execPath,
    [found.path, ...checkArgs(join(dir, "probe.ten"), join(dir, "probe.wasm"))],
    { timeoutMs: 60_000, cwd: dir },
  );

  ok(result.code !== 0, `a broken program must fail; exit was ${String(result.code)}`);
  const parsed = parseDiagnostics(result.stderr);
  ok(parsed.diagnostics.length >= 1, `the real stderr must yield a diagnostic; got:\n${result.stderr}`);

  const first = parsed.diagnostics[0];
  ok(first.code === "TS2304", `the code is the compiler's; got ${String(first.code)}`);

  // **The gate's third assertion.** The compiler's own printed pair, beside the parsed one.
  const printed = /in\s+\S*probe\.ten\((\d+),(\d+)\)/.exec(result.stderr);
  ok(printed !== null, `the stderr must carry an anchor; got:\n${result.stderr}`);
  // **A bare basename, because the child's cwd is the file's directory.** If this ever
  // comes back with `../..` in front of it, the cwd stopped being pinned and every anchor
  // in the editor would resolve against the wrong base.
  const anchorPath = /in\s+(\S+?)\(\d+,\d+\)/.exec(result.stderr)?.[1] ?? "";
  ok(anchorPath === "probe.ten", `the anchor must be the basename; got ${JSON.stringify(anchorPath)}`);
  const [, printedLine, printedColumn] = printed;
  ok(
    first.line === Number(printedLine) && first.column === Number(printedColumn),
    `parsed (${first.line},${first.column}) must equal the compiler's (${printedLine},${printedColumn})`,
  );

  // And the pair must point at the name in the source — the check that catches a
  // convention flip that leaves line/column internally consistent but wrong.
  const line = SOURCE.split("\n")[first.line - 1];
  ok(
    line.slice(first.column - 1, first.column - 1 + 4) === "nope",
    `1-based column must land on the name; landed on ${JSON.stringify(line.slice(first.column - 1, first.column - 1 + 4))}`,
  );

  // The 0-based conversion, on real output.
  const range = toRange(first);
  ok(range.startLine === 1, `0-based line; got ${range.startLine}`);
  ok(range.startCharacter === 9, `0-based character; got ${range.startCharacter}`);
  ok(
    line.slice(range.startCharacter, range.endCharacter) === "nope",
    "the VS Code range covers the name",
  );

  console.log(
    `[ SUCCESS ] EXT5 live: ${checks} assertions against ${found.path} ` +
      `(compiler said ${first.line},${first.column}; parsed ${first.line},${first.column})`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
