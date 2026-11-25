# VEW-22: drawing slips on angled plans, levels and doors

## Outcome

A plan drawing reads the way a drafter would draw it, on plans that are not one square box:

- A plan whose outside walls run two ways, two wings at an angle, has each wing dimensioned
  square to itself: chains and an overall size along each wing's own walls, never one wing
  measured along the other's directions.
- A facade at an angle to the plan's main directions (a chamfered corner, the sides of a fan) is
  dimensioned along itself: its length, and its doors and windows, on a line outside it.
- A plan none of whose directions holds most of its outside walls (a fan, an organic plan) is
  measured along the page, its overall width and depth from the box round its outline, never
  along a diagonal.
- A wall a degree or two off square no longer fills the chains outside the plan with slivers of
  a few millimetres, and a thin wall meeting a facade is marked at its centre line, so its
  thickness is not written as a figure of its own.
- A room label stays inside a narrow wedge room when there is any spot in it that holds it.
- Turning a plan a quarter or half round keeps every length exactly: no wall, room or area
  changes by the rounding of the turn.
- A door 1.5 m or wider that states no kind is drawn as Grid's guess, a pair when its swing is
  stated and it is no wider than two such leaves, else a sliding door, never one huge leaf; it is
  still checked as one leaf and asked about, and the line that asks says it is drawn as a guess.
- `--hide notes` and `grid_view hide=notes` leave off every note, tag and symbol and the notes'
  list (a test holds it). `grid_view look=dark` no longer reads as a look of its own: the tool
  says a picture is always on light paper and dark draws the working look.

Left out on purpose: one level label per level on elevations (another change is on the
elevation and section labels at the same time), and a void's room labelled with its full height
(it needs the floors' levels worked out against the void above, more than this change's area).

## Design

- `packages/floorplan/src/geometry/dimensions.ts`, `outsideDimensions`: the outside straight walls
  are grouped by direction (folded to a quarter turn, `squareCorner`). A group is a wing when it
  holds at least three walls and a quarter of the outside length.
  - One group holding at least half the outside length: as before along its directions, and every
    other group's facades along themselves.
  - No such group and no wing: the page's directions, the overall size from the whole outline,
    and every group not along the page dimensioned along itself.
  - Two wings or more: each group, wings included, along itself, side by side, with its own
    overall size per side; there is no overall size of the whole across the wings.
  "Along itself": the facade walls of a group on one of its four sides, joined when they stand on
  one line, each line's own openings and walls chain and its overall length, pushed out from its
  outermost face. Ids keep `overall-width` and the like for the main directions; a group's own
  dimensions add the group's number (`wall-g1-bottom-0`).
  - A new tolerance, `chainSliver` (0.01 m): a chain's points closer than it are one point, so a
    wall a little off square leaves no sliver. `chainPoint` keeps its meaning for the ends.
  - A new tolerance, `chainThinWall` (0.15 m): a solid wall thinner than this meeting a facade is
    marked at its centre line, as a dividing line is.
  Both go in `tolerances.ts` and the table in `docs/tolerances.md`.
- `packages/floorplan/src/geometry/innerPoint.ts`, `spotsInside`: when the coarse grid finds no
  spot for a label, a grid four times finer is tried, so a long thin wedge at an angle still gets
  its label inside.
- `packages/floorplan/src/geometry/openingKinds.ts`: `guessedDoorKind`, the kind a door that
  states none is drawn as: none below `wideSingleLeaf`; `double` with a stated swing up to twice
  that; else `sliding`. The viewer's `scene.ts` draws a guessed door from `openingSymbol` with that
  kind and marks it `data-kind-guess`. The check is unchanged; the wording of
  `opening/wide-single-leaf` says the door is drawn as a guess (en, es, the contract's table row).
- `packages/cli/src/edit/edits.ts`, `turnPlanBy` and `mirrorPlan`: the turn's centre is kept on
  the plan's own millimetres and points are cleaned of floating noise (micrometres), not rounded
  to millimetres, so a quarter turn moves every point exactly.
- `packages/cli/src/mcp/readTools.ts`: the `look` argument's description says dark draws the
  working look.

Outside the stated area (the viewer's picture), kept as small as possible: `dimensions.ts`,
`innerPoint.ts`, `openingKinds.ts`, `tolerances.ts`, `docs/tolerances.md`, the two message files,
`docs/result-contract.md`'s row for `opening/wide-single-leaf`, `edits.ts` and `readTools.ts`.
No new convention, no new message code.

## Done

- `packages/floorplan/src/geometry/__tests__/dimensions.test.ts`: two wings at 30 degrees each get
  chains along their own walls and no dimension along the other's; a chamfered corner is
  dimensioned along itself; a fan is measured along the page; a survey a degree off square has no
  chain dimension under `chainSliver`; a thin partition is one centre-line point. Each fails
  before the change.
- `innerPoint` test: a thin diagonal wedge gets a spot inside.
- `openingKinds` and a scene test: a 4 m door with no kind draws as sliding, a 1.8 m door with a
  swing as a pair, a 0.9 m door as before.
- `edits` test: a plan stated to a tenth of a millimetre turned 90 degrees keeps every wall length.
- A picture test: `hide notes` leaves no note, tag or symbol and no notes band.
- `npm run typecheck`, `npm run lint`, the floorplan, viewer, rules and cli test folders,
  `ownWords.test.ts`, `contract.test.ts`, the tolerance table test and `npm run scoreboard`.
