// **The red case, kept as a gate rather than as a screenshot.**
//
// A test nobody has seen fail is not a test. This one runs the same assertions against
// the *unmodified* upstream TypeScript grammar and requires that:
//
//   * every `added` assertion **fails** — each one is therefore discriminating: it is
//     testing TensionScript's vocabulary, not TypeScript's; and
//   * every `always` assertion **passes** — so the fixtures are being tokenized, the
//     upstream grammar is not simply broken, and the failures above are about the
//     right thing.
//
// If a future VS Code upgrade taught the TypeScript grammar about `on` or about
// `i32`, this test would fail, and that failure would be the honest signal that one of
// this fork's additions had become redundant.
//
//   node tests/red-case.mjs          # prints the failures it requires, then the verdict
//   node tests/red-case.mjs --quiet  # verdict only

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ASSERTIONS, run } from "./grammar.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const upstream = join(repo, "vendor", "TypeScript.upstream.tmLanguage.json");

const quiet = process.argv.includes("--quiet");

const added = await run(upstream, { mode: "added" });
const always = await run(upstream, { mode: "always" });

if (!quiet) {
  console.log(`upstream grammar: ${upstream}`);
  console.log(`\nthe ${added.total} assertions this fork adds, against upstream:`);
  for (const { reason } of added.failed) console.log(`  fails as required — ${reason}`);
  const failedNames = new Set(added.failed.map((f) => f.assertion.name));
  for (const assertion of ASSERTIONS) {
    if (assertion.mode === "added" && !failedNames.has(assertion.name)) {
      console.log(`  UNEXPECTEDLY PASSED — ${assertion.name}`);
    }
  }
  console.log(`\nthe ${always.total} control assertions, against upstream:`);
  for (const { reason } of always.failed) console.log(`  UNEXPECTEDLY FAILED — ${reason}`);
  if (always.failed.length === 0) console.log(`  all ${always.total} pass, as they must`);
}

const problems = [];
if (added.passed > 0) {
  problems.push(
    `${added.passed} of the ${added.total} added assertions pass against upstream, so they ` +
      `do not measure this fork: ` +
      added.failed.length + " failed, expected " + added.total,
  );
}
if (always.failed.length > 0) {
  problems.push(
    `${always.failed.length} control assertion(s) fail against upstream, so the fixtures ` +
      `themselves are at fault: ${always.failed.map((f) => f.reason).join("; ")}`,
  );
}

if (problems.length > 0) {
  for (const problem of problems) console.log(`FAIL  ${problem}`);
  console.log(
    `[ FAILURE ] EXT1 red case: ${added.failed.length}/${added.total} added assertions fail ` +
      `against upstream (expected ${added.total}), ${always.passed}/${always.total} ` +
      `controls pass (expected ${always.total})`,
  );
  process.exit(1);
}

console.log(
  `[ SUCCESS ] EXT1 red case: ${added.failed.length}/${added.total} added assertions fail ` +
    `against upstream, ${always.passed}/${always.total} controls still pass`,
);
