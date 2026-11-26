// **The manifest gate**: every path `package.json` contributes must exist.
//
// A manifest is a list of paths, and a wrong one is invisible until a user installs the
// package and something does not work. Two of them are load-bearing for this extension:
// the grammar (the whole point) and the language configuration (indentation, brackets).
// The third — the language `icon` — was added in EXT4 from the extension-manifest schema,
// and its failure mode is the quietest of the three: VS Code simply draws nothing.
//
// This is not a schema validator. It checks what a broken path looks like: a path that
// does not resolve, or a grammar whose `scopeName` disagrees with the language that
// includes it.
//
//   node tests/manifest.mjs

import assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const manifest = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));

let checks = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  ++checks;
};

/** Resolve a contributed path, which is written relative to the manifest. */
const pathOf = (rel) => join(repo, rel);

// ── languages ────────────────────────────────────────────────────────────────────
const languages = manifest.contributes?.languages ?? [];
ok(languages.length > 0, "the manifest contributes at least one language");

for (const language of languages) {
  ok(typeof language.id === "string" && language.id.length > 0, `language ${language.id} has an id`);
  ok(
    Array.isArray(language.extensions) && language.extensions.length > 0,
    `language ${language.id} claims at least one extension`,
  );
  for (const ext of language.extensions) {
    ok(ext.startsWith("."), `language ${language.id}: '${ext}' is written as an extension`);
  }

  if (language.configuration != null) {
    ok(
      existsSync(pathOf(language.configuration)),
      `language ${language.id}: configuration '${language.configuration}' exists`,
    );
  }

  // EXT4: the schema's `icon` is `{ light, dark }`, both paths. Measured against the
  // shipped extension-manifest schema in VS Code 1.138.0 (`workbench.desktop.main.js`,
  // the `contributes.languages` item): "A icon to use as file icon, if no icon theme
  // provides one for the language."
  if (language.icon != null) {
    for (const variant of ["light", "dark"]) {
      const rel = language.icon[variant];
      ok(typeof rel === "string" && rel.length > 0, `language ${language.id}: icon.${variant} is a path`);
      ok(existsSync(pathOf(rel)), `language ${language.id}: icon.${variant} '${rel}' exists`);
      // A PNG header check, because an empty or truncated file also exists.
      const bytes = readFileSync(pathOf(rel));
      ok(
        bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
        `language ${language.id}: icon.${variant} '${rel}' is a PNG`,
      );
    }
  }
}

// ── grammars ─────────────────────────────────────────────────────────────────────
const grammars = manifest.contributes?.grammars ?? [];
ok(grammars.length > 0, "the manifest contributes at least one grammar");
const languageIds = new Set(languages.map((l) => l.id));

for (const grammar of grammars) {
  ok(languageIds.has(grammar.language), `grammar for '${grammar.language}' names a contributed language`);
  ok(existsSync(pathOf(grammar.path)), `grammar '${grammar.path}' exists`);
  const parsed = JSON.parse(readFileSync(pathOf(grammar.path), "utf8"));
  // The manifest and the grammar must agree, or the grammar is loaded and matches
  // nothing — silently, because a scope name is not validated against anything else.
  ok(
    parsed.scopeName === grammar.scopeName,
    `grammar '${grammar.path}' declares scopeName '${parsed.scopeName}', manifest says '${grammar.scopeName}'`,
  );
}

// ── the package itself ───────────────────────────────────────────────────────────
ok(typeof manifest.engines?.vscode === "string", "engines.vscode is declared");
ok(typeof manifest.version === "string" && /^\d+\.\d+\.\d+/.test(manifest.version), "version is semver");

console.log(`[ SUCCESS ] manifest: ${checks} checks`);
