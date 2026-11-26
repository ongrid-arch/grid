# ARE-63: routes, walks and the description agree with the areas and the way-out check

ARE-18 made routes, walks and the description read the way-out check's ways. Plans written
since still find places where they part: the walk calls a room "not reached" that the check
reaches, and a size or a route answer that does not match what the check and the areas say.

## Outcome

- The walk (`grid describe --length walk`) reaches every room the way-out check reaches. A part
  of a floor entered only across an open side to the outside (a car park's bays past an open
  ramp, a front garden, a carport) is walked from that open side; a part reached only by a stair
  from another floor is walked from its stair room. "Not reached" is left for rooms the check
  also finds cut off.
- Standing in a room, its size is taken along its own sides: the direction its outline runs
  most of its length, not the one longest straight piece, so a long stair whose sides are cut
  into short pieces is still said as 3 m across and 16.1 m deep.
- `grid_measure what=route` gives the walked length on every room the areas measure, or names
  the room and the reason; a room the check says has a way out has a route out.
- `grid describe` says a door leads in from outside whenever the check reads one as a way out.

## Design

- `packages/cli/src/describe/walk.ts` (`walkFloor`): after the doors in from outside, the walk
  starts again from each open side to the outside the floor's ways read (a dividing line or an
  open edge with nothing past it), then from each room a stair joins to another floor (the
  check's joins, `stairJoins` in `quantities/measure.ts`, exported for it), and only then says
  what is left as not reached. A floor with no way in still starts in its stair room, as before.
  New start kind `open side`, worded in `describe.walk.start.openSide` (en, es draft).
- `walk.ts` (`squareFacing`): a room's own direction is the one its outline's sides run along
  for the greatest length, sides a quarter turn apart counted together; holes are left out. A
  room with a curved side keeps the way you face (ARE-23).
- `packages/cli/src/quantities/measure.ts`, `walked.ts`: only what a test shows parting from the
  check is changed; each such change has its test in the same file as ARE-18's.
- `packages/cli/src/describe/card.ts`: the same, for the description's way in.
- No new convention in `types/floorplan.ts`, no new message code.

Decisions: the walk's extra starts are taken in the order the check would read them (a door,
then an open side, then a stair), so a floor that has a front door is still walked from it first.

## Done

- `packages/cli/src/describe/__tests__/walkAgrees.test.ts`: a car park whose bays are reached
  past an open side to the outside, and a garden reached only by open sides, are walked with no
  room "not reached"; a floor part reached only by its stair is walked from the stair; a long
  stair with its sides cut into pieces is said by its own sides. Each fails before the change.
- `npm run typecheck`, `npm run lint`, the cli package's tests, `ownWords.test.ts`,
  `npm run scoreboard` (no count worse).
