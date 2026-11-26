# VEW-70 — Say which parts to be demolished are on the floor drawn

## Outcome

On a plan with phases, `grid_view kind=plan` draws what `grid draw` draws: walls and openings
to be demolished dashed, "to be demolished" in the key, and its note counts what `grid_check`
counts. On a plan with more than one floor, the note also says how many of those parts are on
the floor drawn, names them, and says on which floors the others are, so an agent looking at a
floor with no dashed lines does not take the plan for one without demolition. `highlight`
takes the ids of parts to be demolished.

## Design

VEW-14 already draws the plan as stated in `grid_view` and counts the work for the whole plan.
What is left is the note on a plan of several floors: it said "drawn dashed" of parts that are
on another floor. In `packages/cli/src/mcp/readTools.ts`, the plan view takes the ids read to be
demolished (`idsInPhase`) and sorts them by floor (a wall and a room by their own floor, an
opening by its wall's), and adds one line when any is on another floor. The sentence is a new
message, `view.phases.floor`, in `en.ts` and `es.ts`. Nothing changes on a plan of one floor.
The whole-plan count stays as it is, the same count as `grid_check`.

## Done

A test in `packages/cli/src/mcp/__tests__/phases.test.ts` takes a phased school through the
tools (marked existing, two classrooms merged, a door marked to be demolished): `grid_check`
and `grid_view` give the same count, the picture holds the same dashed parts as `grid draw`,
and a demolished id can be highlighted. A second test takes a plan of two floors with the
demolition upstairs and checks the floor line. Type check, lint, the CLI tests, the words and
contract tests and the scoreboard pass.
