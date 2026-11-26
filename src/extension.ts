// The only file that imports `vscode`. Everything decidable lives in `src/core/`.
//
// That split is the round's architectural rule (EXT5 §1) and it is what makes the
// behaviour testable: `tests/core.mjs` asserts against `dist/core/*.js` in plain Node,
// with no editor, no download and no `vscode` module. If logic drifts into this file it
// stops being testable, and the gate becomes a screenshot.

import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import * as vscode from "vscode";

import {
  type CompilerFound,
  checkArgs,
  discoverCompiler,
  runCompiler,
} from "./core/compiler";
import { parseDiagnostics, resolveFile, toRange } from "./core/diagnostics";
import { definitionAt } from "./core/definition";
import { type Symbol as TensionSymbol, parseSymbols } from "./core/symbols";
import { checkStatus, foundStatus, notFoundStatus, shouldCheck } from "./core/status";

/** `tension` — the collection name a user sees in the Problems panel. */
const COLLECTION = "tension";

/** A compile takes ~1.2 s measured, so a 500 ms debounce cannot keep up with typing. */
const DEBOUNCE_MS = 600;

/** Longer than any measured compile (1.2 s) by a wide margin; a hang is killed. */
const TIMEOUT_MS = 20_000;

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection(COLLECTION);
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = "workbench.action.openSettings";
  status.text = "$(sync~spin) TensionScript: looking for the compiler";
  status.show();

  const compiler = resolveCompiler();
  // Narrowed once, because a union inside a closure does not narrow through a call to a
  // predicate in another module (`shouldCheck`).
  const compilerPath = compiler.ok ? compiler.path : null;
  const timers = new Map<string, NodeJS.Timeout>();
  let misses = 0;
  let lastMiss = "";
  const running = new Map<string, { kill: () => void }>();

  // **No diagnostics at all** when there is no compiler, and one item that says why and
  // which setting to set. The copy is built in `core/status.ts` so `tests/core.mjs` can
  // assert it; this branch only assigns it.
  const initial = compiler.ok ? foundStatus(compiler) : notFoundStatus(compiler);
  status.text = initial.text;
  status.tooltip = initial.tooltip;

  const check = async (document: vscode.TextDocument): Promise<void> => {
    if (compilerPath === null || !shouldCheck(compiler)) return;
    const previous = running.get(document.uri.toString());
    previous?.kill(); // one compile per file at a time; a newer request wins

    status.text = "$(sync~spin) TensionScript: checking…";
    // The output goes to the OS temp directory, **not beside the user's source**: a check
    // that leaves a `.wasm` in the workspace on every debounce is a file the user never
    // asked for and would have to gitignore.
    const outFile = join(tmpdir(), `tension-check-${createHash("sha1").update(document.uri.fsPath).digest("hex").slice(0, 12)}.wasm`);
    const cwd = dirname(document.uri.fsPath);
    const result = await runCompiler(process.execPath, [compilerPath, ...checkArgs(document.uri.fsPath, outFile)], {
      timeoutMs: TIMEOUT_MS,
      cwd,
      onSpawn: (child) => running.set(document.uri.toString(), { kill: () => child.kill("SIGKILL") }),
    });
    running.delete(document.uri.toString());

    const parsed = parseDiagnostics(result.stderr);
    const byFile = new Map<string, vscode.Diagnostic[]>();
    for (const d of parsed.diagnostics) {
      const key = vscode.Uri.file(resolveFile(d.file, cwd)).toString();
      const range = toRange(d);
      const item = new vscode.Diagnostic(
        new vscode.Range(range.startLine, range.startCharacter, range.endLine, range.endCharacter),
        d.message,
        d.severity === "error"
          ? vscode.DiagnosticSeverity.Error
          : d.severity === "warning"
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Information,
      );
      item.source = "tension";
      if (d.code !== null) item.code = d.code;
      const list = byFile.get(key) ?? [];
      list.push(item);
      byFile.set(key, list);
    }

    // Only this document's entries are replaced, so a check of one file cannot erase
    // another file's results.
    const own = document.uri.toString();
    diagnostics.set(document.uri, byFile.get(own) ?? []);

    const summary = checkStatus({
      blocks: parsed.blocks,
      kept: parsed.diagnostics.length,
      dropped: parsed.dropped,
      timedOut: result.timedOut,
      error: result.error,
    });
    status.text = summary.text;
    status.tooltip = `${summary.tooltip}\ncompiler: ${compilerPath}`;
  };

  const schedule = (document: vscode.TextDocument): void => {
    if (document.languageId !== "tension") return;
    const key = document.uri.toString();
    const existing = timers.get(key);
    if (existing !== undefined) clearTimeout(existing);
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        void check(document);
      }, DEBOUNCE_MS),
    );
  };

  context.subscriptions.push(
    diagnostics,
    status,
    vscode.workspace.onDidChangeTextDocument((event) => schedule(event.document)),
    vscode.workspace.onDidSaveTextDocument((document) => schedule(document)),
    vscode.workspace.onDidOpenTextDocument((document) => schedule(document)),
    vscode.workspace.onDidCloseTextDocument((document) => {
      diagnostics.delete(document.uri);
      const timer = timers.get(document.uri.toString());
      if (timer !== undefined) clearTimeout(timer);
    }),
    vscode.languages.registerDocumentSymbolProvider({ language: "tension" }, symbolProvider()),
    vscode.languages.registerDefinitionProvider(
      { language: "tension" },
      definitionProvider(compiler, (miss, word) => {
        if (miss === null) return;
        misses += 1;
        lastMiss = `${word ?? "?"} — ${miss}`;
        status.tooltip = `${String(status.tooltip)}\n\ndefinition: ${misses} unresolved (last: ${lastMiss})`;
        // The count lives in the tooltip rather than in the status text, so a miss does
        // not replace the compile result a reader is looking at.
      }),
    ),
    { dispose: () => diagnostics.clear() },
  );

  for (const document of vscode.workspace.textDocuments) schedule(document);
}

export function deactivate(): void {
  // Nothing global is held; the collection is disposed through `context.subscriptions`.
}

function resolveCompiler(): CompilerFound {
  const setting = vscode.workspace.getConfiguration("tension").get<string>("compilerPath", "");
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const found = discoverCompiler({ settingPath: setting, workspaceFolder: root });
  if (!found.ok) return found;

  // The `~lib/` jump needs the compiler *package* root, which is two levels above
  // `bin/tensionscript.js` when the compiler is a checkout.
  compilerPackageRoot = found.path.replace(/[\\/]bin[\\/]tensionscript\.js$/, "");
  return found;
}

let compilerPackageRoot: string | null = null;

function kindOf(symbol: TensionSymbol): vscode.SymbolKind {
  switch (symbol.kind) {
    case "function":
    case "method":
      return vscode.SymbolKind.Function;
    case "class":
      return vscode.SymbolKind.Class;
    case "struct":
      return vscode.SymbolKind.Struct;
    case "interface":
      return vscode.SymbolKind.Interface;
    case "enum":
      return vscode.SymbolKind.Enum;
    case "namespace":
      return vscode.SymbolKind.Namespace;
    case "field":
      return vscode.SymbolKind.Field;
    case "constant":
      return vscode.SymbolKind.Constant;
  }
}

function symbolProvider(): vscode.DocumentSymbolProvider {
  return {
    provideDocumentSymbols(document) {
      const symbols = parseSymbols(document.getText());
      const items = symbols.map((symbol) => {
        const line = symbol.line - 1;
        const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);
        const selection = new vscode.Range(
          line,
          symbol.column - 1,
          line,
          symbol.column - 1 + symbol.length,
        );
        const detail = symbol.decorators.length > 0 ? `@${symbol.decorators.join(" @")}` : undefined;
        return new vscode.DocumentSymbol(symbol.name, detail ?? "", kindOf(symbol), range, selection);
      });
      // Nest members under their container, so the outline matches the file's shape.
      const byName = new Map(items.map((item) => [item.name, item]));
      const roots: vscode.DocumentSymbol[] = [];
      symbols.forEach((symbol, index) => {
        const item = items[index];
        if (symbol.container !== null && byName.has(symbol.container)) {
          byName.get(symbol.container)!.children.push(item);
        } else {
          roots.push(item);
        }
      });
      return roots;
    },
  };
}

function definitionProvider(
  compiler: CompilerFound,
  onResult: (miss: string | null, word: string | null) => void,
): vscode.DefinitionProvider {
  return {
    provideDefinition(document, position) {
      const result = definitionAt({
        file: document.uri.fsPath,
        text: document.getText(),
        line: position.line,
        character: position.character,
        compilerRoot: compiler.ok ? compilerPackageRoot : null,
      });
      if (result.location === null) {
        // EXT5 §2.4: a miss is *counted*, and the reason is shown. A provider that
        // silently returns nothing at every cross-file reference is indistinguishable
        // from a broken one, and the promise this round makes is only same-file plus
        // `~lib/`, so the limit has to be visible.
        onResult(result.reason ?? "unknown-name", result.word);
        return null;
      }
      onResult(null, result.word);
      return new vscode.Location(
        vscode.Uri.file(result.location.file),
        new vscode.Position(result.location.line, result.location.column),
      );
    },
  };
}
