# Reading a `.tension` file in an editor

Two working setups, and the tradeoff between them. Neither is a placeholder for the
other.

The upstream of this document is `TensionScript/docs/guest-editor.md`, which is about
mode A and explains what the declaration file silences. This one adds the grammar-only
mode and keeps the numbers honest by quoting them from that round rather than
re-deriving them.

---

## Mode B — this extension (grammar only)

```jsonc
// .vscode/settings.json, or user settings
{
  "files.associations": {
    "*.tension": "tension",
    "*.ten": "tension"
  }
}
```

The extension registers the `tension` language for `.tension` and `.ten`, so in practice
the association is only needed if something else has claimed the extension. What you get:

- the compiler's scalar primitives (`i32`, `i64`, `u32`, `u64`, `f32`, `f64`, `usize`,
  `isize`, and `i8`/`i16`/`u8`/`u16`/`bool`) scoped as `support.type.primitive.tension`,
  so a theme can colour them differently from your own classes;
- `on` in `let t = f() on new Eager();` scoped as `keyword.control.task-policy.tension`;
- everything else exactly as TypeScript reads it — decorators, generics, strings,
  `async`/`await`, comments — because the grammar *is* TypeScript's, with two rules added;
- indentation, bracket matching and comment toggling from TypeScript's language
  configuration.

What you do **not** get: completion, hover, go-to-definition, diagnostics, or semantic
highlighting. Mode B has no language server, so those are absent rather than wrong.

## Mode A — the TypeScript server (no extension)

```jsonc
{
  "files.associations": { "*.tension": "typescript", "*.ten": "typescript" }
}
```

and a `tsconfig.json` beside your sources:

```jsonc
{
  "compilerOptions": {
    "noEmit": true,
    "target": "es2022",
    "experimentalDecorators": true,
    "strict": false
  },
  "include": [
    "../TensionScript/types/tension-guest.d.ts",
    "**/*.tension"
  ]
}
```

That declaration file — `TensionScript/types/tension-guest.d.ts` — is the single source
of truth for the guest language's surface. It is **not copied into this repository**:
one definition, in the place the compiler ships, pointed at by path.

The numbers, measured in the DL45 round with `tsc` over a real guest:

| | errors reported |
|---|---|
| no declaration file | **13** |
| with `types/tension-guest.d.ts` | **3** |

The three that remain cannot be silenced by a declaration, because TypeScript has no
such syntax:

- **`@external("env", "emit")` on a function declaration** → `TS1206 Decorators are not
  valid here`. TypeScript allows decorators on classes and members, not on an ambient
  function declaration.
- **`async f(): i32`** → `TS1064 The return type of an async function ... must be the
  global Promise<T>`. In TensionScript an async function's declared type *is* its result
  type; that is what makes `await t` yield `i32`.
- **`~lib/…` imports** → unresolved module, or resolved to a second copy of the
  compiler's own source if you add a `paths` mapping.

Mode A also reports TypeScript diagnostics that argue with valid guest code — that is
the price of having the server at all.

## Which one

| you are… | use |
|---|---|
| writing new code, want completion and hover | **A** |
| reading code, want the shapes to look right and no argument | **B** |
| needing both | **C** — an LSP, which is a separate project |

## Marking the language on the web view

`.gitattributes`, display only:

```gitattributes
*.tension linguist-language=TypeScript
*.ten linguist-language=TypeScript
```

This changes nothing about how either mode reads a file, and nothing about how the
compiler reads it.

---

## What has and has not been checked

**Checked, by command** (`npm test` in this repository): the grammar's 17 assertions over
5 fixtures pass, and the 8 assertions this fork adds all fail against the unmodified
upstream grammar while the 9 controls pass. The extension installs headlessly
(`code --install-extension`, output quoted in the round report).

**Not checked: what a `.tension` file actually looks like in VS Code.** No editor window
was opened, so every colour claim above is a claim about *scopes*, not about pixels. A
theme decides what `support.type.primitive.tension` is painted — most themes will not
have a rule for it and will fall back to their generic type colour, which is the
intended behaviour but has not been looked at.
