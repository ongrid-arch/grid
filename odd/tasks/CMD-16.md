# CMD-16: say what Grid makes in the first line the server sends

## Outcome

An agent or host that connects to Grid, of either era of the protocol, reads in the first line of
the server's instructions that Grid draws floor plans for any small space (a van, a cabin, a
module, a container) and gives a picture and the free-floor numbers in one or two calls, and that
it makes pictures, sheets and a whole-building 3D model. A host that defers tools can find Grid
by those words, and an agent asked for a render finds the 3D model before it reaches for another
program.

## Design

- The instructions are already sent on `initialize` (2024-11-05 to 2025-06-18 clients) and on
  `server/discover` (CMD-7), from one constant, `INSTRUCTIONS`. A test now holds both answers to
  the same text, so neither era can lose it.
- The line is the opening of the first shared paragraph, `TOOLS_WORK_ON_PLANS`
  (`packages/cli/src/guide/paragraphs.ts`), so it is first in the instructions and in the
  guide's "Start here" with no new place to keep in step. `docs/agent-guide.md` carries it as
  written; `docs/tool-server.md` says it.
- Decision: no new tool or schema change; the tool definitions are not touched.

## Done

- `packages/cli/src/mcp/__tests__/protocol.test.ts`: the `initialize` result for each of the
  three older versions and `server/discover` carry the same instructions, and its first
  sentence names small spaces, picture, free floor and the 3D model.
- `guide/__tests__/oneSource.test.ts` still passes (the paragraph is in the guide as written).
- typecheck, lint, tests, scoreboard.
