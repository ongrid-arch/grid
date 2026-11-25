# LVL-15: roofs worked out from the floors' elevations, not their order

## Outcome

- A part of a floor is roofed only where nothing of the building stands over it: no floor whose
  floor level is higher stands on it, at any height. A split-level house (front half-levels at
  0 and 2.8 m, back ones at 1.4 and 4.2 m) has a roof over its two top half-levels and none over
  the two it carries, whatever order `level` gives the floors. A half-level car park's decks are
  floors, not roofs, under the deck above them; a row of split-level houses stepping up a street
  has one roof per half-level at the top of each house, not four.
- The slab a half level stands on is a floor slab, and the section and the facade label it as
  that floor's level, never "Roof": they read the roofs from `planEnvelope`, which no longer lays
  one under a floor.
- A floor that shares its `level` with others but stands at its own elevation (a stepped house,
  each step a floor of the same level) is roofed on its own walls: its roof's underside is its
  floor level plus its tallest wall, not the tallest wall of the whole level, so the roof meets
  the tops of its walls instead of hovering over them. A floor that states its `height` is
  roofed at it, as before.
- A basement that runs out under a garden, with the ground stated over it, still has no roof
  there (LVL-13), and the section labels none.
- A plan whose floors stack one on another in order (every plan in the lab's sets so far) gives
  the same roofs as before.

## Design

- `packages/floorplan/src/geometry/envelope.ts`, `planEnvelope`:
  - The roof is the floor's outline less the outline of every floor whose floor level
    (`elevations.floors`) stands higher than its own by more than `sameFloorLevel`, cut in order
    of height, lowest first, and stopping once nothing is left (a tower floor is covered by the
    one on it, so the cost stays one cut per floor). `under` lists the floors that took a part
    of it off, rather than every floor on the next level.
  - Decision: "anything above, at any height" rather than "only floors within reach of the
    storey's top". A half-level deck's clear height need not reach the deck above (a car park's
    2.4 m under a 2.9 m step), and the floor two steps up is the one that covers it; a rule
    bound to the storey top would miss it. The cost is that a floor cantilevered far over a
    lower roof with air between them takes that part of the roof off. That is a soffit over a
    roof, rare, and the old rule (next level only) did not roof it correctly either.
  - A floor above whose outline is not known makes the roof unknown only when its walls' box
    meets this floor's outline: a broken floor of another building, or of another part of the
    plan, does not take every roof under it into doubt.
  - The roof's height on its walls: a floor that states no `height` and shares its `level`
    with another floor stands its roof on its own tallest wall (`tallestDrawnWall`, as the
    storey's clear height is read, so a wall through floors, a fence and a garden wall count as
    they do there). Alone on its level, that is the clear height already, so nothing is worked
    out again. Decision: done in the envelope, not in `stackFloors`, because the elevations of
    the next level are stacked on the highest top of the level and must stay so; only where the
    roof stands changes.
- `packages/floorplan/src/geometry/elevations.ts`: `tallestDrawnWall` exported (one word), so
  the envelope reads a floor's walls by the same rule. Outside the card's two files; kept to that.
- Not here: `stacking.ts`, `rooms/`, the sheet's floor-to-floor and the floor count of a
  split-level row, the earth against a basement wall, and the ground line of a sloped site.
- No new message code. The header of `envelope.ts` says the new rule.

## Done

- `packages/floorplan/src/geometry/__tests__/roofsFromElevations.test.ts`, failing before the
  change and passing after:
  - a split-level house given with its `level` order alternating front and back: roofs over the
    two top half-levels only, each over its whole outline, and none on the two below; the same
    with the levels given in another order; the section through it labels one roof per top
    half-level and no roof at 2.8 m or 4.2 m under a floor;
  - a half-level car park of three decks a side: only each side's top deck is roofed;
  - a stepped house of two floors on one level, 0.6 m apart, walls 3.0 and 2.4 m: each roof's
    underside on its own walls' tops (3.0 m both), and a floor that states its height keeps it;
  - a basement running out under a stated ground: no roof over the part under the garden.
- The envelope, roof, section and facade tests already in `packages/floorplan` pass unchanged.
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/floorplan`,
  `packages/cli/src/__tests__/ownWords.test.ts`, `npm run scoreboard` (no count worse).
