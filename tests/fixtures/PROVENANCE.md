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
