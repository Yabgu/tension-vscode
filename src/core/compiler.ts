// Finding a compiler, and running one. **No `vscode` import lives here** and none may
// be added: this file is imported by `tests/core.mjs` in plain Node, which is what makes
// the extension's behaviour testable at all (EXT5 §1).
//
// The discovery order is EXT5 §2.1, and the last step of it is *silence*:
//
//   1. the `tension.compilerPath` setting
//   2. <workspaceFolder>/bin/tensionscript.js
//   3. <workspaceFolder>/../TensionScript*/bin/tensionscript.js
//   4. `tensionscript` on PATH
//   5. nothing — and then the extension publishes **no diagnostics at all**
//
// Step 5 is the important one. A wrong squiggle under correct code is worse than no
// squiggle, which has been this project's rule since DL45; so there is no fallback to a
// guess, no bundled copy, and no "try the one in node_modules and hope".

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

/** A resolved compiler, or the reason there is not one. */
export type CompilerFound =
  | { ok: true; path: string; via: DiscoveryVia }
  | { ok: false; tried: string[]; setting: string };

export type DiscoveryVia =
  | "setting"
  | "workspace-bin"
  | "sibling-checkout"
  | "path";

/** The smallest filesystem surface discovery needs, so tests can lie to it. */
export interface FsProbe {
  exists(path: string): boolean;
  isDirectory(path: string): boolean;
  readdir(path: string): string[];
}

export const realFs: FsProbe = {
  exists: (p) => existsSync(p),
  isDirectory: (p) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  },
  readdir: (p) => {
    try {
      return readdirSync(p);
    } catch {
      return [];
    }
  },
};

export interface DiscoverInput {
  /** `tension.compilerPath` as the user set it. Empty or absent means "not set". */
  settingPath?: string;
  /** Absolute path of the first workspace folder, if a folder is open. */
  workspaceFolder?: string;
  /** `process.env.PATH`, split by the caller's platform delimiter. */
  pathEnv?: string;
  /** `process.platform === "win32"`, which changes the executable suffixes to try. */
  isWindows?: boolean;
  fs?: FsProbe;
}

/** The setting name, quoted in every message that tells a user what to change. */
export const SETTING = "tension.compilerPath";

/**
 * The CLI entry inside a checkout, relative to its root.
 *
 * **Forward slashes, always.** Node's `fs` accepts `/` on Windows, so one spelling works on
 * both platforms — and `path.join` would spell it `bin\\tensionscript.js` there, which
 * makes every candidate path depend on the *host* that built it. Measured: a Windows CI job
 * failed the workspace-discovery assertion for exactly that reason while Linux passed.
 */
const CLI_RELATIVE = "bin/tensionscript.js";

/**
 * Join with `/`, so a candidate path reads the same on every host.
 *
 * Backslashes in the base are folded to `/` as well: `C:\\w\\Tension` and `C:/w/Tension`
 * are the same directory to Node on Windows, and only one of them compares equal to a
 * string written the other way.
 */
function relay(base: string, ...parts: string[]): string {
  const trimmed = base.replace(/\\/g, "/").replace(/\/+$/, "");
  return [trimmed, ...parts].join("/");
}

/**
 * The directory above `path`, as pure string work.
 *
 * **Not `resolve(path, "..")`**, which consults the *host's* idea of a root and returns
 * `\\work` for `/work/Tension` on Windows. That made the sibling rung host-dependent, which
 * is the same defect as the separator one one line up: a Windows CI job failed the sibling
 * assertion while Linux passed.
 */
function parentOf(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const cut = normalized.lastIndexOf("/");
  if (cut < 0) return normalized;
  return cut === 0 ? "/" : normalized.slice(0, cut);
}

/**
 * Resolve the compiler, in the declared order, and never guess.
 *
 * `tried` is returned even on success (minus the winner) so the status bar can say what
 * was looked at — "not found" with no list is the kind of message that makes a user file
 * a bug against their own setup.
 */
export function discoverCompiler(input: DiscoverInput = {}): CompilerFound {
  const fs = input.fs ?? realFs;
  const isWindows = input.isWindows ?? process.platform === "win32";
  const tried: string[] = [];

  // 1. The setting. It is a path to a file, and it wins even over a workspace compiler:
  //    a user who names one has said which compiler they mean.
  const setting = (input.settingPath ?? "").trim();
  if (setting.length > 0) {
    const absolute = isAbsolute(setting)
      ? setting
      : input.workspaceFolder
        ? resolve(input.workspaceFolder, setting)
        : setting;
    tried.push(`setting ${SETTING} = ${absolute}`);
    if (fs.exists(absolute)) return { ok: true, path: absolute, via: "setting" };
  }

  // 2. The workspace's own `bin/`.
  if (input.workspaceFolder) {
    const candidate = relay(input.workspaceFolder, CLI_RELATIVE);
    tried.push(`workspace ${candidate}`);
    if (fs.exists(candidate)) return { ok: true, path: candidate, via: "workspace-bin" };

    // 3. A sibling checkout — the layout every round of this project has used:
    //    ~/work/Tension next to ~/work/TensionScript-a2. The trailing `*` is because the
    //    checkout is named `TensionScript-a2` here and `TensionScript` elsewhere.
    const parent = parentOf(input.workspaceFolder);
    tried.push(`sibling ${parent}/TensionScript*/${CLI_RELATIVE}`);
    const siblings = fs
      .readdir(parent)
      .filter((name) => name.startsWith("TensionScript"))
      .sort();
    for (const name of siblings) {
      const candidate = relay(relay(parent, name), CLI_RELATIVE);
      if (fs.exists(candidate)) return { ok: true, path: candidate, via: "sibling-checkout" };
    }
  }

  // 4. PATH. This is the weakest rung and the only one that can find a compiler nobody
  //    in this project vended, so it is last and it is still not a guess: the name is
  //    exact and the file must exist.
  const exts = isWindows ? [".cmd", ".exe", ".bat", ""] : [""];
  // **The delimiter follows `isWindows`, not the host.** `path.delimiter` is `:` on POSIX
  // and `;` on Windows, so splitting a Windows PATH with the host's delimiter turns
  // `C:\\tools;D:\\bin` into `C`, `\\tools;D`, `\\bin` — measured here, and it silently
  // finds nothing on a machine that has the compiler.
  // Both spellings are written out, rather than one of them taken from `path.delimiter`:
  // that constant is the *host's*, so `isWindows: false` on a Windows machine would still
  // split on `;`. Measured — this is the second version of this line, and the first still
  // failed on Windows CI for exactly that reason.
  const pathSeparator = isWindows ? ";" : ":";
  for (const dir of (input.pathEnv ?? process.env.PATH ?? "").split(pathSeparator)) {
    if (dir.length === 0) continue;
    for (const ext of exts) {
      const candidate = relay(dir, `tensionscript${ext}`);
      if (fs.exists(candidate)) return { ok: true, path: candidate, via: "path" };
    }
  }
  tried.push("PATH tensionscript");

  // The refusal names the setting **in `tried`**, not only in `setting`: a caller that
  // prints the list must not be able to produce "not found" with no way out of it.
  tried.push(`set ${SETTING} to bin/tensionscript.js`);

  return { ok: false, tried, setting: SETTING };
}

/**
 * The argv a check needs — **the project's own flags, not invented ones.**
 *
 * Read from the tree: `tension-framework/package.json`'s build script and every
 * `build/*.wasm.build.json` record say `--runtime incremental --target release`.
 * `--optimizeLevel 0` is the lowest level, which is the fastest to compile and the least
 * work done to a program whose output the editor never runs. `--noColors` keeps the
 * output parseable; the parser does not have to strip ANSI, and a colour code inside a
 * file path would be the kind of bug that only appears on a TTY.
 *
 * No `-o`: a check that emits an artifact writes a file beside the user's source on every
 * keystroke-debounce. The compiler refuses to emit without an output path only for a
 * full build; `--noEmit` would skip the type check too, so the artifact goes to a temp
 * path the caller owns and deletes.
 */
export function checkArgs(file: string, outFile: string): string[] {
  return [
    file,
    "-o",
    outFile,
    "--runtime",
    "incremental",
    "--target",
    "release",
    "--optimizeLevel",
    "0",
    "--noColors",
  ];
}

export interface RunResult {
  stdout: string;
  stderr: string;
  /** The child's exit code, or null when it was killed or never started. */
  code: number | null;
  timedOut: boolean;
  /** Set when the child could not be started at all. */
  error?: string;
}

export interface RunOptions {
  timeoutMs: number;
  /**
   * The child's working directory. **Set it deliberately.**
   *
   * The compiler prints diagnostic paths relative to its own cwd — measured: an absolute
   * `-o` under `/tmp` yielded `in ../../../../tmp/dbg-…/probe.ten(2,10)`, a path that only
   * resolves against the cwd the child inherited. Before this was explicit, that was the
   * extension host's cwd, which is not a place a user's file is. Pinning it to the file's
   * own directory makes the anchor a bare basename and makes `resolveFile` exact.
   */
  cwd?: string;
  /** Called with the child so a caller can kill it on a newer request. */
  onSpawn?: (child: ChildProcess) => void;
}

/**
 * Run the compiler once, bounded by a timeout, and collect its output.
 *
 * **No shell.** `spawn` with an argument array, because a workspace path with a space in
 * it is normal on both platforms and a shell-quoted command line is where that breaks.
 *
 * The timeout exists because a compiler that hangs must not hang the editor: the child is
 * killed and the result says `timedOut`, which the caller turns into a status message
 * rather than into diagnostics nobody can act on.
 */
export function runCompiler(
  command: string,
  args: string[],
  options: RunOptions,
): Promise<RunResult> {
  return new Promise((done) => {
    let child: ChildProcess;
    const useNode = /\.js$/i.test(command);
    try {
      // A `.js` compiler is run through this Node, matching how `bin/tensionscript.js`
      // is meant to be invoked and avoiding a Windows `.cmd` shim that needs a shell.
      child = spawn(useNode ? process.execPath : command, useNode ? [command, ...args] : args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        cwd: options.cwd,
      });
    } catch (error) {
      done({
        stdout: "",
        stderr: "",
        code: null,
        timedOut: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      done({ stdout, stderr, code: null, timedOut, error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ stdout, stderr, code, timedOut });
    });

    options.onSpawn?.(child);
  });
}
