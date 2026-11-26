# Attribution — where the forked grammar came from

This repository's grammar is **not written from scratch**. It is Microsoft's TypeScript
TextMate grammar, with two additions (§4). That is deliberate: the TensionScript
language *is* TypeScript's grammar with a different type vocabulary, and TypeScript's
grammar is MIT-licensed data, so forking it is both legal and the shortest path to
correct highlighting.

It is **not** a fork of TypeScript's *language features*. `typescript-language-features`
ships a ~10 MB `tsserver` and cannot be replaced by an extension; see the README's modes
table for what a grammar-only extension buys and what it does not.

## 1. What was taken, and from where

| file | taken from | how |
|---|---|---|
| `vendor/TypeScript.upstream.tmLanguage.json` | `typescript-basics/syntaxes/TypeScript.tmLanguage.json` | copied verbatim |
| `vendor/language-configuration.upstream.json` | `typescript-basics/language-configuration.json` | copied verbatim |

Both were read on **2026-11-26** from the VS Code build installed on this machine:

```
$ code --version
1.138.0
7debcd0e2acdea1c52de81bf9ee1620444407dda
x64

$ ls -d <that install>/extensions/typescript-basics
/usr/lib/code/extensions/typescript-basics
```

The extension's own manifest reported `"version": "10.0.0"` and `"license": "MIT"`
(publisher `vscode`, repository `github.com/microsoft/vscode`).

**A note on the version, because the brief expected a different one.** The brief records
`1.148.0` observed on the Windows host. This machine's Linux install is **1.138.0**, and
that is the one whose files could be read; no Windows VS Code installation was reachable
from here (see the round report's "not verified"). Both are the same `typescript-basics`
grammar lineage; the commit that actually matters is the upstream one below, and it is
pinned by hash.

## 2. Integrity

```
5422ec4b90f842fd729a43e95a5d31e41382c94623fb3c93e127e4ef582998c9  vendor/TypeScript.upstream.tmLanguage.json
8481e77aa40ba99173988a8319b766ef9cce5f250183f01711e54f7a03baf6df  vendor/language-configuration.upstream.json
```

## 3. The upstream commit the grammar itself names

The grammar's `version` field points at the `TypeScript-TmLanguage` repository, not at
VS Code, and it is **left untouched** in the fork:

```
https://github.com/microsoft/TypeScript-TmLanguage/commit/48f608692aa6d6ad7bd65b478187906c798234a8
```

Its `information_for_contributors` field — also untouched, plus one appended line
naming this fork — asks that fixes go upstream first.

## 4. What this fork adds

`tools/fork.mjs` derives `syntaxes/tension.tmLanguage.json` from the vendored copy. It
changes exactly five things:

1. `name`: `"TypeScript"` → `"TensionScript"`
2. `scopeName`: `"source.ts"` → `"source.tension"` (safe: upstream mentions its own root
   scope exactly once, so no rule `include`s it by name — checked)
3. one line appended to `information_for_contributors`
4. a rule for `on` after a call, as `keyword.control.task-policy.tension`, prepended to
   root `patterns` and to `#expression`
5. a rule for the compiler's scalar primitives, as `support.type.primitive.tension`,
   included first inside `#type`

Everything else — all 146 upstream `repository` rules, every existing scope suffix
including the `.ts` ones — is upstream, unchanged. The `.ts` suffix on inner scopes is
kept on purpose: themes target scopes like `entity.name.type.ts`, and a fork that
renamed them would trade a cosmetic purity for broken colouring.

## 5. Licence

VS Code's `ThirdPartyNotices.txt` carries the MIT text for
`microsoft/TypeScript-TmLanguage` (Copyright (c) Microsoft Corporation). That text is
reproduced in this repository's `LICENCE`, together with this repository's own MIT
licence.
