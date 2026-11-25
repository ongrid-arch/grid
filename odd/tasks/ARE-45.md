# ARE-45: the route measure answers with the same fields, with or without a width

## Outcome

`grid_measure what=route` always answers with one record: how far the route is walked
(`length`), each room's share (`legs`), every door on the way (`steps`) and the narrowest
door or opening (`narrowestPassage`), and, set against a body or trolley width, whether it gets
through (`through`, `way`, `shortest`, `narrower`, `figure`). When the person gives no width,
Grid's own indicator, `usePassageWidth` (0.9 m), is used and the answer says so (`figure.from`
is `grid`, and the text says "Grid's own indicator"). An agent can no longer get a length
without a width check, or a width check without a length.

## Design

- `packages/cli/src/mcp/readTools.ts`, the route branch of `grid_measure` only: the plain route
  (`routeBetween`) is always worked out, with `start`, `end`, `x` and `y`; the way for a body
  (`wideRoute`) is always worked out too, with the person's width or the default. The data is
  `{ found, ...route, code, figure, width, through, way, shortest, narrower }`; the text is the
  plain lines followed by the width lines.
- A route that takes stairs (plain route across floors) cannot be measured for a body, as
  before: the width fields are then `through: null`, `way`, `shortest` and `narrower` empty or
  null, and the text says the stairs' widths are not measured.
- Decision: the width fields are flat in `answer` as they were with a width, so a reader that
  worked with a width keeps working; the plain fields are added to them.
- The tool's description and `docs/tool-server.md` say it.

## Done

- A test in `packages/cli/src/mcp/__tests__/useIndicators.test.ts`: without width the answer has
  `length`, `legs`, `narrowestPassage`, `through`, `figure` from `grid` with 0.9 m; with a width
  it has the same keys; the same room pair without and with a width gives the same `length`.
- The old "as it was" test is changed to say what it keeps.
- `npm run typecheck`, `npm run lint`, the cli and rules test folders touched, `ownWords` and
  `tolerances` tests, `npm run scoreboard`.
