# ARE-77: walls and slabs with earth against them, and the dig

## Outcome

A take-off of a building with floors in the earth (a basement, a car park under a building, a
house cut into a hillside) measures what is buried as what it is. The outer walls of a floor
whose floor stands below the ground are retaining walls up to the ground, listed by the height of
earth they hold, and that part of them is never the outside face to render or a wall of its kind.
A slab over a floor in the earth that stands at or under the ground (a basement reaching out under
the garden) is a buried slab with the soil over it, never a roof. Every slab that rests on the
earth is a ground-bearing slab, on whichever floor it is (the half of a basement floor that has no
floor under it, a ground floor past the basement), never an upper floor structure. And the earth
taken out is given as an excavation volume, floor by floor, from the ground down to the underside
of each ground-bearing slab. The inside face of a retaining wall is its own quantity, not plaster.

## Design

- `packages/floorplan/src/geometry/earth.ts` (new): `planEarth(plan)` works it all out from the
  envelope (`planEnvelope`), the outer faces (`planShell`), the floors' levels
  (`floorElevations`) and the ground (`groundLevel`, so a slope, a building's pad and a floor's
  stated `below` all count):
  - retaining walls: each outer face of a floor, on its wall, with the ground at the wall's two
    ends; the earth's depth over the floor level runs straight between them (the ground is one
    even slope), held to the wall's height. The face below the ground is the retaining area,
    exactly integrated; the retained height is the most along the wall. A depth within
    `sameFloorLevel` is no earth.
  - buried slabs: the roof Grid does not lay because the ground covers it (LVL-13), now kept by
    the envelope as `buried`, and a flat roof over a floor in the earth whose top stands no more
    than `buriedSlabAboveGround` (new tolerance, 0.3 m) above the ground. The soil over it is the
    ground at its middle less its top, never below 0.
  - ground-bearing slabs: of every floor that stands on the ground (`below` unstated or
    `ground`, not standing off it as `groundLevel` judges), the slab less every lower floor's
    outline. A base slab is that whole.
  - excavation: each ground-bearing slab's area times the depth from the ground at its middle to
    the slab's underside, when positive. Each point of the plan is under one lowest slab, so the
    sum is the dig.
- `packages/floorplan/src/geometry/envelope.ts`: the roof it leaves out under the ground is kept
  as `buried` (its pieces, area and top), so nothing is drawn that was not before.
- `packages/cli/src/quantities/takeoff.ts`: `planTakeoff` gains `earth` (left out on a plan with
  none); the envelope line of a floor gains its slab's ground-bearing area and its buried slab,
  and a roof that is a buried slab is no longer its roof; each room's wall face less the part
  against the earth, given as `earthFace`.
- `packages/cli/src/quantities/estimate.ts`: `retaining_wall:<height>` lines (m²), the buried
  part out of `wall:<kind>` and `external_finish`; `retaining_face` for the inside face against
  the earth, out of `wall_finish:<use>`; `buried_slab` (m², with its soil cover in the words);
  `slab` is every ground-bearing slab, on any floor, and `upper_floor` is each floor's structure
  less its ground-bearing share; `excavation` in m³ (a new unit for the rates file).
- `packages/cli/src/mcp/readTools.ts`: grid_takeoff words the earth in text and CSV.
- Words in `messages/en.ts` and `es.ts`. Docs: `docs/tolerances.md`, the take-off in
  `docs/tool-server.md`.
- Decisions: skirting stays along a retaining wall (it is the room's floor edge; a car park with
  no skirting is the room's finish, CNT-51). The retained height is measured from the floor
  level, not the foundation. Upper floor less its ground-bearing share is pro rata on the gross
  internal area, as the slab is measured to the outside face.

## Done

- `packages/cli/src/quantities/__tests__/earth.test.ts`: a basement under a garden, a car park
  under half of it and a ground floor past it; the figures by hand: retaining area by height,
  the buried slab and its cover, ground-bearing slabs on every floor, upper floor less them,
  excavation; none of it as render, roof or plaster; a hillside house on a slope; a plan with no
  floor in the earth answers as before.
- `npm run typecheck`, `npm run lint`, `npm run build`, vitest on the touched folders, the
  tolerances test, `ownWords.test.ts`, `npm run scoreboard`.
