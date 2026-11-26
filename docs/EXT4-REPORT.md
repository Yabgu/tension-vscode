# EXT4 — `struct` bodies, and the vocabulary audit

| | |
|---|---|
| repository | **`~/work/tension-vscode`** `main` @ **`d2aafb6`**, clean, pushed |
| gate | `[ SUCCESS ] manifest: 18 checks` · `[ SUCCESS ] EXT4 grammar: 13 fixtures, 71 assertions` |
| red case | `[ SUCCESS ] EXT4 red case: 50/50 added assertions fail against upstream, 21/21 controls still pass` |
| package | **`tension-vscode-0.2.0.vsix`**, 9 files, **25,934 bytes**; installed, listed |
| CI | **`45885153618` — 4/4 jobs green**, both Windows jobs included |
| product repos | **untouched**: Tension `57f045c` (branch), TensionScript `113fdd24` (`develop`), both clean |

The user's two complaints were **one bug plus one schema fact the seat had already
dismissed.** `struct` was a blind spot; the icon was a field that exists.

---

## 0. The declaration

**Declared before running:** fixtures 10 → **13**, assertions 48 → **70**, 1 new rule
(`struct`) and 1 extended (the primitive set gains `v128`).

**Measured:** fixtures **13**, assertions **71**.

One over, and it is a finding: the extra assertion is `v128`'s, added *after* the audit
showed it was the one name in `CommonNames` that EXT2 had left out (§3). I did not plan it
because the brief's Phase C asked whether `v128` was missing, and the answer changed the
set.

---

## 1. Phase A — `struct`

### 1.1 Before, measured

The user's file (`export struct Vec3 { x: f32; }`), tokenized with the shipped 0.1.0
grammar:

```
1:1 export  keyword.control.export.ts
1:8 struct  variable.other.readwrite.alias.ts     <- a VARIABLE
1:15 Vec3   variable.other.readwrite.alias.ts     <- a VARIABLE
2:3 x       variable.other.readwrite.alias.ts     <- no field scope at all
2:4 :                                            <- no scope
2:6 f32     variable.other.readwrite.alias.ts     <- a VARIABLE, not a type
```

and the whole file sat inside `meta.export.ts`, because `export struct …` matched upstream's
`export` rule and nothing else claimed it.

**Why a class body worked and a struct body did not:** upstream establishes
`meta.field.declaration` + `meta.type.annotation` inside `class`, and EXT2's primitive rule
lives inside `#type`. A struct body got neither, so there was nothing to include it into.
Every fixture passed because every fixture used `class`.

### 1.2 What a struct accepts was measured, not assumed

`src/parser.ts:515` parses a struct with `parseClassOrInterface`, so the body *is* a class
body. Each construct was compiled with the vendored compiler (`0.14.1`, `113fdd24`) before
being written into the fixture:

| construct | result |
|---|---|
| plain `struct` / `export struct` | **compiles** |
| generic `struct Rec<T>` | **compiles** |
| method declared in the body | **compiles** (93 B) |
| getter in the body | **compiles** |
| `@unmanaged struct` / `@managed struct` | **compiles** |
| `struct X extends Y` | **refused**: `AS100 Not implemented: inheritance on an @inline struct (a value type is final: no base class, no virtual methods)` |
| struct declared inside a function | **refused**: `TS1109 Expression expected.` |
| a field of type `v128` | compiles **only with `--enable simd`** (`AS103 Feature 'simd' is not enabled`) |

A *call* through an `@inline` struct value is refused too (`AS100: reading an @inline struct
value as a whole`), so the fixture declares a method without calling one — what the grammar
must scope is the declaration.

### 1.3 The fix

A rule that **reuses upstream's body wholesale**:

```js
const structRule = {
  name: "meta.struct.tension",
  begin: "…(?:(\\bexport)\\s+)?(?:(\\bdeclare)\\s+)?\\b(struct)\\b(?=\\s+|/[/*])",
  beginCaptures: { 1: keyword.control.export.ts,
                   2: storage.modifier.ts,
                   3: storage.type.struct.tension },
  end: "(?<=\\})",
  patterns: [ { include: "#comment" },
              { match: "(?<=\\bstruct\\s+)[_$[:alpha:]][_$[:alnum:]]*",
                captures: { 0: { name: "entity.name.type.struct.tension" } } },
              { include: "#class-declaration-or-expression-patterns" } ],
};
```

Two scopes of its own — the keyword and the name — and everything inside the body is
upstream's. That is why the body works in full on the first try: fields, methods, getters,
parameters, returns, type arguments, nested types.

**Two measured details shaped it:**

1. It must be **first in `#declaration`**, ahead of `#export-declaration`, which is what had
   claimed `export struct …` and wrapped the whole file.
2. `export`/`declare` are captured **on the begin match**. The first version matched them by
   pattern *inside*, where the begin had already consumed them — and `export` scoped as
   nothing at all.

### 1.4 The token dump, `struct-body.ten`

```
35:1  export  meta.struct.tension keyword.control.export.ts
35:8  struct  meta.struct.tension storage.type.struct.tension
35:15 Vec3    meta.struct.tension entity.name.type.struct.tension
36:3  x       meta.struct.tension meta.field.declaration.ts meta.definition.property.ts variable.object.property.ts
36:4  :       meta.struct.tension meta.field.declaration.ts meta.type.annotation.ts keyword.operator.type.annotation.ts
36:6  f32     meta.struct.tension meta.field.declaration.ts meta.type.annotation.ts support.type.primitive.tension
39:9  v128    meta.struct.tension meta.field.declaration.ts meta.type.annotation.ts support.type.primitive.tension
48:10 i8      meta.struct.tension meta.field.declaration.ts meta.type.annotation.ts support.type.primitive.tension
50:10 Vec3    meta.struct.tension meta.field.declaration.ts meta.type.annotation.ts entity.name.type.ts
51:3  scaled  meta.struct.tension meta.method.declaration.ts meta.definition.method.ts entity.name.function.ts
51:13 f32     meta.struct.tension meta.method.declaration.ts meta.parameters.ts meta.type.annotation.ts support.type.primitive.tension
52:3  get     meta.struct.tension meta.method.declaration.ts storage.type.property.ts
```

`f32` and `i8` are `support.type.primitive.tension` — the user's exact complaint — and
`struct` is a declaration keyword. Compiled: `COMPILED, 2913 bytes` with `--enable simd`.

---

## 2. Phase B — the keyword audit

`src/tokenizer.ts` declares **64** keyword strings in `tokenFromKeyword`. Counted over the
30 guest sources in `tension-core/tests/programs/**/*.ten` (comments stripped, because a
keyword in prose is not a use):

```
26 keywords used by the corpus
38 keywords with ZERO uses      <- the blind spot's size
```

For each of the 38 I wrote a probe, **compiled it**, and tokenized the ones that compiled:

```
26 compiled       25 scope correctly, 1 (`struct`) was wrong
12 refused by the compiler
```

**Why 25 of 26 were already right, and that is the audit's actual finding:** upstream *is*
TypeScript, so it already knows every keyword TypeScript has. The only keywords the
compiler declares that TypeScript does **not** have are `struct` and `on` — and `on` was
fixed in EXT1. **The blind spot is therefore not "unused keywords" but "keywords upstream
lacks"**, which is a much smaller set and explains why the corpus's silence was harmless
for 63 of them and fatal for one.

### The table

Every verdict below is from a compiled sample, except where the compiler refused it.

| keyword | `Token` | corpus uses | scope today | verdict |
|---|---|---:|---|---|
| `struct` | `Struct` | 0 | `storage.type.struct.tension` | fixed (EXT4) |
| `abstract` | `Abstract` | 0 | `storage.modifier.ts` | ok |
| `as` | `As` | 0 | `keyword.control.as.ts` | ok |
| `async` | `Async` | 59 | `—` | ok — corpus uses it |
| `await` | `Await` | 75 | `—` | ok — corpus uses it |
| `break` | `Break` | 2 | `—` | ok — corpus uses it |
| `case` | `Case` | 0 | `keyword.control.switch.ts` | ok |
| `class` | `Class` | 6 | `—` | ok — corpus uses it |
| `const` | `Const` | 25 | `—` | ok — corpus uses it |
| `constructor` | `Constructor` | 3 | `—` | ok — corpus uses it |
| `continue` | `Continue` | 0 | `keyword.control.loop.ts` | ok |
| `declare` | `Declare` | 13 | `—` | ok — corpus uses it |
| `default` | `Default` | 0 | `keyword.control.switch.ts` | ok |
| `do` | `Do` | 0 | `keyword.control.loop.ts` | ok |
| `else` | `Else` | 2 | `—` | ok — corpus uses it |
| `enum` | `Enum` | 0 | `storage.type.enum.ts` | ok |
| `export` | `Export` | 49 | `—` | ok — corpus uses it |
| `extends` | `Extends` | 2 | `—` | ok — corpus uses it |
| `false` | `False` | 3 | `—` | ok — corpus uses it |
| `for` | `For` | 6 | `—` | ok — corpus uses it |
| `from` | `From` | 52 | `—` | ok — corpus uses it |
| `function` | `Function` | 124 | `—` | ok — corpus uses it |
| `get` | `Get` | 0 | `storage.type.property.ts` | ok |
| `if` | `If` | 19 | `—` | ok — corpus uses it |
| `implements` | `Implements` | 0 | `storage.modifier.ts` | ok |
| `import` | `Import` | 49 | `—` | ok — corpus uses it |
| `in` | `In` | 0 | `keyword.operator.expression.in.ts` | ok |
| `instanceof` | `InstanceOf` | 0 | `keyword.operator.expression.instanceof.ts` | ok |
| `interface` | `Interface` | 0 | `storage.type.interface.ts` | ok |
| `let` | `Let` | 159 | `—` | ok — corpus uses it |
| `namespace` | `Namespace` | 0 | `storage.type.namespace.ts` | ok |
| `new` | `New` | 18 | `—` | ok — corpus uses it |
| `null` | `Null` | 2 | `—` | ok — corpus uses it |
| `on` | `On` | 6 | `—` | ok — corpus uses it |
| `override` | `Override` | 0 | `storage.modifier.ts` | ok |
| `private` | `Private` | 0 | `storage.modifier.ts` | ok |
| `protected` | `Protected` | 0 | `storage.modifier.ts` | ok |
| `public` | `Public` | 0 | `storage.modifier.ts` | ok |
| `readonly` | `Readonly` | 0 | `storage.modifier.ts` | ok |
| `return` | `Return` | 83 | `—` | ok — corpus uses it |
| `set` | `Set` | 0 | `storage.type.property.ts` | ok |
| `static` | `Static` | 0 | `storage.modifier.ts` | ok |
| `super` | `Super` | 1 | `—` | ok — corpus uses it |
| `switch` | `Switch` | 0 | `keyword.control.switch.ts` | ok |
| `this` | `This` | 4 | `—` | ok — corpus uses it |
| `throw` | `Throw` | 0 | `keyword.control.trycatch.ts` | ok |
| `true` | `True` | 1 | `—` | ok — corpus uses it |
| `type` | `Type` | 0 | `storage.type.type.ts` | ok |
| `typeof` | `TypeOf` | 0 | `keyword.operator.expression.typeof.ts` | ok |
| `var` | `Var` | 0 | `storage.type.ts` | ok |
| `void` | `Void` | 53 | `—` | ok — corpus uses it |
| `while` | `While` | 7 | `—` | ok — corpus uses it |
| `catch` | `Catch` | 0 | `—` | refused by the compiler |
| `debugger` | `Debugger` | 0 | `—` | refused by the compiler |
| `delete` | `Delete` | 0 | `—` | refused by the compiler |
| `finally` | `Finally` | 0 | `—` | refused by the compiler |
| `is` | `Is` | 0 | `—` | refused by the compiler |
| `keyof` | `KeyOf` | 0 | `—` | refused by the compiler |
| `module` | `Module` | 0 | `—` | refused by the compiler |
| `of` | `Of` | 0 | `—` | refused by the compiler |
| `package` | `Package` | 0 | `—` | refused by the compiler |
| `try` | `Try` | 0 | `—` | refused by the compiler |
| `with` | `With` | 0 | `—` | refused by the compiler |
| `yield` | `Yield` | 0 | `—` | refused by the compiler |

Notes on three rows:

- **`in`** — my first probe did not use the keyword at all (`return 1;`); it compiled and
  reported nothing. Corrected probe: `("a" in o)` → `keyword.operator.expression.in.ts`.
- **`typeof`** — first probe assigned the result to `i32` and was refused with `TS2322`
  (`typeof` yields a string, not a number). That was my probe's error, not the language's;
  with `let s: string = typeof x` it compiles.
- **`throw`** compiles on its own (`throw new Error("x")`) while `try`/`catch`/`finally` are
  refused (`AS100 Not implemented: Exceptions`). The grammar scopes `throw` as
  `keyword.control.trycatch.ts`, which is what a reader expects.

Of the 12 refusals, none is a grammar defect: the grammar scopes them the way TypeScript
does, which is the only sensible reading for a user who typed them by mistake, and a
fixture asserting on a construct the compiler refuses would be a fixture that cannot
compile — the thing EXT2 established we do not do.

---

## 3. Phase C — the primitive set, verified against the compiler

`CommonNames` (`src/common.ts:117-133`) declares, in order:

```
i8 i16 i32 i64 isize u8 u16 u32 u64 usize bool f32 f64 v128
```

plus `ref_func`, `ref_extern`, `ref_any`, `ref_eq`, `ref_struct` — those are reference forms
for the GC ABI, not names a user writes as an annotation, and no guest writes one.
`isNumeric` (`src/inference.ts:202`) lists the thirteen numeric ones and omits `bool` and
`v128`, which is right for *its* question (arithmetic) and not this one.

**`bool` is in EXT2's set** — the brief asked; it is there. **`v128` was missing**, and that
was a real gap: a struct field of type `v128` compiles (`--enable simd`), and unlisted it
fell through to `entity.name.type.ts` — a type, but not the primitive scope every other
numeric name gets. **`f16` does not exist** anywhere in `src/`. So the set is now fourteen
names and complete.

**Every position, asserted:**

| position | fixture | scope |
|---|---|---|
| parameter | `primitive-positions.ten:17` `i8` | `support.type.primitive.tension` |
| return | `:17` `f64` | same |
| cast `<f64>` | `:18` | same, inside `cast.expr.ts` |
| type argument `Array<u32>` | `:22` | same |
| type argument `changetype<i32>` | `:23` | same |
| annotation `let s: i16` | `:24` | same |
| **struct field** | `struct-body.ten:36,48,39` | same — the position the user reported |

**Controls**, both compiled: a variable named `f32` stays `variable.other.readwrite.ts`; a
class named `i32` stays `entity.name.type.class.ts` and reads as a constructor where it is
constructed. `primitive-names.ten` cannot also *use* `i32` as a type — inside that file the
class shadows the primitive (`TS2322`), which is the compiler confirming that only position
distinguishes the two.

---

## 4. Phase D — the icon

**The seat's empirical check asked the wrong question.** It measured what VS Code's 84
built-in languages *use* in `contributes.languages`, and concluded there is no per-language
icon field. The question that decides it is what the schema *permits*. Reading the
extension-manifest schema shipped in this VS Code (1.138.0) — it is embedded in
`out/vs/workbench/workbench.desktop.main.js`, and its description strings resolve against
`out/nls.messages.json`:

```js
properties:{ id:{…}, aliases:{…}, extensions:{…}, filenames:{…}, filenamePatterns:{…},
  mimetypes:{…}, firstLine:{…}, configuration:{…},
  icon:{type:"object",properties:{light:{…,type:"string"},dark:{…,type:"string"}}} }
```

> **24188**: "A icon to use as file icon, **if no icon theme provides one for the language**."
> **24190** (light): "Icon path when a light theme is used"
> **24189** (dark): "Icon path when a dark theme is used"

So the field exists, it is per-language, and it is a **fallback** — exactly the shape that
makes shipping it safe. Shipping an icon *theme* would replace every user's whole icon set,
which is the trade the brief was right to refuse; this is the opposite trade, and it costs
two small PNGs.

Shipped: `icons/tension-light.png` (188 B) and `icons/tension-dark.png` (194 B), 32×32,
generated here rather than borrowed — a `>_` prompt on a rounded square. Declared as:

```json
"icon": { "light": "./icons/tension-light.png", "dark": "./icons/tension-dark.png" }
```

**What it will and will not do:** with no file icon theme, `.ten` files now get this icon.
With Material Icon Theme or any other icon theme active, that theme decides and this is
ignored — which is correct, and means the icon may well be invisible for the user who
reported it. The durable fix for *them* is a PR to their theme (option (a) in the brief);
this is option (b-): a fallback that costs nothing and needs no opt-in.

**A new gate** — `tests/manifest.mjs`, 18 checks — exists because an icon path that does not
resolve draws nothing and reports nothing. It validates that every path the manifest
contributes exists (grammar, configuration, both icon variants, with a PNG header check
because an empty file also exists) and that the grammar's own `scopeName` matches what the
manifest claims.

---

## 5. Gates

```
$ npm test
fork: syntaxes/tension.tmLanguage.json is current
[ SUCCESS ] manifest: 18 checks
[ SUCCESS ] EXT4 grammar: 13 fixtures, 71 assertions
[ SUCCESS ] EXT4 red case: 50/50 added assertions fail against upstream, 21/21 controls still pass
```

The red case prints 50 `fails as required` lines; these are seven of them, all from this
round's fixture:

```
fails as required — struct-body.ten:35:8 `struct` scoped as `variable.other.readwrite.alias.ts`, expected `storage.type.struct.tension`
  fails as required — struct-body.ten:35:15 `Vec3` scoped as `variable.other.readwrite.alias.ts`, expected `entity.name.type.struct.tension`
  fails as required — struct-body.ten:48:3 `count` scoped as `meta.object-literal.key.ts`, expected `variable.object.property.ts`
  fails as required — struct-body.ten:48:8 `:` scoped as `punctuation.separator.key-value.ts`, expected `keyword.operator.type.annotation.ts`
  fails as required — struct-body.ten:48:10 `i8` is not inside `meta.field.declaration` — scopes were `source.ts meta.objectliteral.ts meta.object.member.ts variable.other.readwrite.ts`
  fails as required — struct-body.ten:36:6 `f32` scoped as `variable.other.readwrite.alias.ts`, expected `support.type.primitive.tension`
  fails as required — struct-body.ten:48:10 `i8` scoped as `variable.other.readwrite.ts`, expected `support.type.primitive.tension`
```

The remaining 43 are EXT1's and EXT2's, unchanged.

### Packaging and install

```
$ npx @vscode/vsce package
 DONE  Packaged: …/tension-vscode-0.2.0.vsix (9 files, 25.33 KB)
   25,934 bytes

$ code --install-extension tension-vscode-0.2.0.vsix
Installing extensions...
Extension 'tension-vscode-0.2.0.vsix' was successfully installed.

$ code --list-extensions --show-versions | grep -i tension
tension.tension-vscode@0.2.0
```

The installed grammar is **byte-identical** to the tested one (`cmp -s`), carries the icon
files, and tokenizes `struct-body.ten` from its installed location with `f32` and `i8` as
primitive types.

### Line endings

```
i/lf    w/lf    attr/text eol=lf   package.json
i/lf    w/lf    attr/text eol=lf   syntaxes/tension.tmLanguage.json
i/none  w/none  attr/text eol=lf   language-configuration.json
i/-text w/-text attr/-text         icons/tension-dark.png
i/-text w/-text attr/-text         icons/tension-light.png
```

The icons are `-text` because `.gitattributes` declares `*.png binary` — correct, and the
reason the manifest test checks a PNG header rather than trusting `existsSync`.

### CI

**Run `45885153618`** — `main` @ `d2aafb6`:

```
Grammar (ubuntu-latest, node 20):  success
Grammar (ubuntu-latest, node 22):  success
Grammar (windows-latest, node 20): success
Grammar (windows-latest, node 22): success
```

and the Windows job's steps, so "green" is not a claim about missing information:

```
Grammar (windows-latest, node 22)  The grammar is generated, not hand-edited
  fork: syntaxes/tension.tmLanguage.json is current
Grammar (windows-latest, node 22)  The manifest's paths exist
  [ SUCCESS ] manifest: 18 checks
Grammar (windows-latest, node 22)  The red case
  [ SUCCESS ] EXT4 red case: 50/50 added assertions fail against upstream, 21/21 controls still pass
```

EXT3-prep's `.gitattributes` is in place, which is why these are green on Windows.

---

## 6. What the tree contradicted

1. **The brief's Phase D premise was wrong, in our favour.** "There is no per-language icon
   field in VS Code" is false — `contributes.languages[].icon` exists, described in the
   schema's own words as a file icon used "if no icon theme provides one for the language".
   The seat's measurement was about built-in *usage*, which is not the same question, and
   the brief invited exactly that distinction.
2. **The brief's §0 says "Tension main 57f045c".** The tree is on
   `feat/dl46-ten-canonical` @ `57f045c`; `main` is `cae892c`. §1.5 of the same brief says
   the branch, so I followed the branch and left `main` untouched.
3. **EXT2's `v128` omission was a mistake**, and its stated reason ("not a scalar
   annotation") does not survive contact: a user writes it as a field type.
4. **`struct X extends Y` is refused**, so the brief's question "does a struct have
   `extends`?" has a design answer rather than a scoping one — there is nothing to scope.

## 7. What would have made this round unnecessary

A **keyword-coverage gate**: a test that fails when the compiler declares a keyword that no
fixture exercises. `src/tokenizer.ts`'s switch is a machine-readable list, and the corpus's
silence on 38 of its 64 keywords was measurable the day EXT1 was written. Had that gate
existed, `struct` would have failed it before a user opened the file.

It is cheap but not free here: this repository has no copy of the compiler's source, so the
list would have to be checked in and would drift — which is why I am reporting it rather
than building it. The honest version is a test **in TensionScript's repo** that dumps
`tokenFromKeyword` and asserts the extension's fixture corpus covers it, and that crosses
the ownership line this round respects.

## 8. Commits

```
0fe9356  test: three fixtures for struct bodies and the primitive positions
56bb2dc  feat: `struct` gets a body, and `v128` joins the primitives
d2aafb6  feat: a file icon, and the manifest gate that makes a broken path impossible
```

Pushed to `main` (`682cd87..d2aafb6`); nothing force-pushed. **Both product repos
untouched**: Tension `feat/dl46-ten-canonical` @ `57f045c`, TensionScript `develop` @
`113fdd24`, both clean.

## 9. What I did not verify

- **No editor window was opened.** The struct scopes are asserted from the tokenizer, not
  seen on screen; the icon is a valid PNG in the right manifest field, and whether the user's
  theme lets it show is not something I can see from here.
- **The icon may not appear for the user who reported it**, because a file icon theme
  overrides the language icon by design. That is the schema's own wording, and it means
  "the icon is fixed" is only true for users with no icon theme.
- **Windows**: no Windows machine was used — the evidence is CI's two Windows jobs plus, in
  EXT3-prep, a local `core.autocrlf=true` clone.
- **The 12 refused keywords' scopes are unassertable** by construction: a fixture for them
  cannot compile. Their table row says what the grammar does, measured on the file the
  compiler rejected, not on a compiled sample.
- **`v128` was only exercised with `--enable simd`.** Whether every other position accepts
  it (a parameter, a return) was not probed; only the struct field was, because that is the
  position the user's report concerned.
