# MSG-32: the rules an agent must keep arrive within what a host shows

## Outcome

An agent whose host shows only the opening of a server's instructions (Claude Code keeps about
the first 2,048 characters) still reads, in that opening, what Grid makes (floor plans for any
small space, a picture and the free-floor numbers in one or two calls, a whole-building 3D
model), that the brief comes first, how to retell what Grid said with its label, that room names
travel with every export, and where the guide for agents is. Both eras of the protocol get the
same text: `initialize` (2024-11-05, 2025-03-26, 2025-06-18) and `server/discover`.

## Design

- The text is already sent on `initialize` and on `server/discover` from one constant,
  `INSTRUCTIONS` (CMD-7, CMD-16). What still kept the rules from agents is its length: 3,431
  characters, with the label and retelling rule and the room-name rule last, so a host that cuts
  at 2,048 dropped exactly those.
- `packages/cli/src/mcp/protocol.ts`: the paragraphs are put in a new order, and
  `INSTRUCTIONS_SHOWN` (2,048) names the share a host is known to show. First, inside it: what
  Grid makes, brief first, label and retelling, room names travel, the guide and schema
  resources. After it: rooms first, units, source of truth, first questions. Those four are in
  the guide the opening points to, and `grid_write_rooms`'s own description says rooms first,
  the plan file as the source of truth and the display line for units.
- `packages/cli/src/guide/paragraphs.ts`: `SHARED` takes the same order, since the instructions
  are its paragraphs in order. The guide, the skill and the README take their paragraphs by
  name, so none of them changes.
- Decision: no paragraph is reworded or cut, so every place that carries a paragraph keeps it
  word for word. Decision: the units rule falls after the share; it is kept in the guide, the
  skill and `grid_write_rooms`'s description.

## Done

- `packages/cli/src/mcp/__tests__/protocol.test.ts`: the first `INSTRUCTIONS_SHOWN` characters
  hold the opening line, the brief, the label and retelling rule, the room-name rule and the
  guide resource, whole; fails on the old order.
- The existing test that `initialize` for each older version and `server/discover` carry the
  same text still passes, as does `guide/__tests__/oneSource.test.ts`.
- typecheck, lint, the cli package's tests, ownWords and contract tests, scoreboard.
