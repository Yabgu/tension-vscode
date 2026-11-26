# Fixtures — what they are and where they came from

Four of these five files are **real guest programs**, copied byte for byte from the
TensionScript repository's guest corpus. The fifth is written for this test and is the
only one that is not a guest; §2 says why.

Taken from `~/work/Tension` at commit **`5383f56`**
(`tension-core/tests/programs/<path>` under that commit), 2026-11-26.

## 1. Copied guests

| file here | source path in Tension | sha256 (first 16) |
|---|---|---|
| `async-on-main.tension` | `async/async-on-main.tension` | `94331579da193530` |
| `rt-guards.tension` | `async/rt-guards.tension` | `17341c21b91e52f2` |
| `schedule-order.tension` | `async/schedule-order.tension` | `5016250b290f9a49` |
| `suspend-serve.tension` | `thread/suspend-serve.tension` | `07cbec6eb8ae844f` |

Why these four:

- **`async-on-main.tension`** — the shared ABI contract program. Async, a
  `@external` decorator, primitives in parameter and return annotations.
- **`rt-guards.tension`** — the framework's runtime guards, and the corpus's richest
  type vocabulary: `usize` in a return position *and* in a type argument, `f32` and
  `u64` fields, `Task<…>` generics.
- **`schedule-order.tension`** — the only guest in the corpus that uses the `on`
  task-policy connector, at lines 179-183. Without it there is nothing to assert about
  the round's main addition.
- **`suspend-serve.tension`** — threads: `__spawnThread`/`__threadJoin`, a served body,
  `RemotePolicy`. The thread half of the corpus.

The programmes are asserted, not executed: this repository never compiles them, and a
fixture that falls behind Tension is a copy that needs refreshing, not a build failure.
Refreshing is `cp` from the paths above.

## 2. The one that is not a guest

| file here | what it is |
|---|---|
| `identifier-named-on.tension` | written for this test; see its own header |

`on` is **not a reserved word** in TensionScript — `let on = 1;` compiles, verified with
the vendored compiler (`TensionScript` `f97c0f03b334`, exit 0). The grammar's keyword
rule therefore looks behind for `)` rather than matching the word everywhere, and this
fixture is what holds that rule honest: if it ever matched `on` unconditionally, these
four identifiers would start reading as keywords and the red case would not catch it,
because the red case only proves upstream fails.

It is not a guest because no guest names a variable `on`, and inventing a guest to
prove the point would be a worse lie than writing a test fixture that says what it is.

## 3. EXT2's fixtures

EXT2 added five. Two more are copied guests; three are written fixtures whose every
construct is transcribed from a real file in the compiler's tree, and whose headers say
which line. **All three written ones that can compile were compiled**, with the vendored
compiler, and the byte count in each header is the result of that run.

| file here | what it is | compiles? |
|---|---|---|
| `decorators.tension` | 11 of the compiler's 12 decorators, each in a position transcribed from a real declaration | **yes** (5 061 B, `--enable threads`) |
| `decorator-builtin.tension` | `@builtin`, which only a library source may carry (`src/program.ts:3016`) | **no, by design** — `AS212` |
| `fixed-array.tension` | `[T * n]` in three shapes, from `tests/gc/ordering-late.ts:16` and `tests/compiler/interop/fixed-array-unmanaged-view.ts:35` | **yes** (269 B) |
| `tuple-refused.tension` | a tuple type — the fixed-array rule's control | **no, by design** — `AS100 Not implemented: Tuple types` |
| `names-not-types.tension` | `Task` as a field, a local and a property read — the task-type rule's control | **yes** (4 879 B) |

The two that do not compile are the two where compiling would be a contradiction: a
fixture that carried `@builtin` *and* compiled would prove the compiler wrong, and a
fixture with a tuple would prove the brief's tuple question answered differently. Their
headers state the command and its error instead.
