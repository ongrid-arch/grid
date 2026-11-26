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
  room whose straight sides are less than half its outline (a round one) keeps the way you face
  (ARE-23); one with a single curved wall now has sides of its own.
- `packages/cli/src/quantities/measure.ts` (`floorsNotChecked`, the floors of the check's own
  `no_stairs` notes) and `packages/cli/src/mcp/readTools.ts` (the route branch of
  `grid_measure`): a route to the outside from such a floor says, found or not, that grid_check
  does not follow that floor's way out, and carries the note as `notChecked`. The route still
  reads the plan's ways as before: a basement left by its own opening is still routed out of.
- `packages/cli/src/describe/facts.ts` (`commonIn`, from the check's `graph.common`) and
  `card.ts`: a door onto the common parts is said as a way in from them, never as no door in
  and never as a door from outside.
- Words in `packages/floorplan/src/messages/en.ts` and `es.ts` (draft), outside this card's area
  but where every sentence goes (MSG-11).
- No new convention in `types/floorplan.ts`, no new message code.

Decisions: the walk's extra starts are taken in the order the check would read them (a door,
then an open side, then a stair), so a floor that has a front door is still walked from it first.

## Done

- `packages/cli/src/describe/__tests__/walkAgrees.test.ts`: a carport reached only across its
  open sides is walked with no room "not reached"; a wing reached only by its stair is walked
  from the stair; a 3 m stair with a curved end entered at a chamfer is 2.8 m across inside; a
  flat entered from the common parts is described so. Each fails before the change.
- `packages/cli/src/quantities/__tests__/routesAgree.test.ts`: the basement car park, with and
  without its own way out, answers `notChecked` and the line; a floor the check follows does not.
- Run over every lab and generated plan (3386): no room the check reaches is "not reached" by
  the walk (43 before), and every route out the check reaches has a length.
- `npm run typecheck`, `npm run lint`, the cli package's tests, `ownWords.test.ts`,
  `npm run scoreboard` (no count worse).
