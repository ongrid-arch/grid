# ARE-71: openings cut through walls that stay, priced in the change take-off

## Outcome

An agent costing a plan with phases (`grid_takeoff` with `for: "change"`) gets, for every new
door, window or doorless opening in a wall that stays (an existing wall), the work of cutting it
as lines a rates file prices, not only one "new opening" line:

- The hole taken out of the wall, in m², by the wall's kind and thickness
  (`demolish:cut:interior:0.3`), in the demolish list. The part of the hole an old opening in the
  same wall leaves open already, one to be demolished, is not cut again.
- The reveals round it, for a doorless opening too: a knock-through has two sides and a head to
  make good like a door does (`make_good:reveals`).
- A lintel over it, in metres, by the wall's kind and thickness (`new:lintel:interior:0.3`), in the
  new list and marked assumed: the plan holds no lintels, so Grid takes the opening's width and a
  bearing at each end. An opening whose head reaches the wall's top, or that lies wholly in an old
  opening's hole, takes none.

So a 2.4 m knock-through in a 300 mm wall that stays reads as the hole, its reveals and its
lintel, not one line the person works out by hand.

## Design

- `packages/cli/src/quantities/change.ts`: in the loop over new openings, for one in an existing
  solid wall: the hole (`hole`, as the infill uses) less what demolished openings in the same wall
  take (`overlap`), as `demolish:cut:<kind>:<thickness>`; the reveals for every opening type; and
  a lintel `new:lintel:<kind>:<thickness>` (unit m) when something is cut and the head is below
  the wall's top. Lines carry their own `assumed` mark (until now every change line was given).
  The rules are new sentences in `CHANGE_RULES`, like the others there; the lines keep the list
  order (demolish, make good, new), the cut after the openings to be demolished, the lintel after
  the new openings.
- The bearing at each end is a default distance, so it goes in the tolerances table:
  `lintelBearing` in `packages/floorplan/src/geometry/tolerances.ts` and its row in
  `docs/tolerances.md` (0.15 m), read with `limit()`.
- `docs/plan-file.md` (the cost under phases) says what the lines are. `changes/ARE-71.md` is the
  fragment. `packages/cli/src/__tests__/ownWords.test.ts` gets change.ts's new English sentence
  count.
- Decision: the cut is in the demolish list, because taking a hole out of a wall is demolition
  priced by the wall it is in; the lintel is new work. Reveals stay counted on the whole opening
  as before, even where an old opening was.
- Not changed: the door and window schedule, the rooms text compiler, the estimate for a plan
  with no phases.

## Done

- `packages/cli/src/quantities/__tests__/changeOpenings.test.ts`: a 2.4 m doorless opening
  knocked through a 0.3 m existing wall gives the cut (2.4 × 2.1), the reveals (2 × 2.1 + 2.4) ×
  0.3, a lintel of 2.4 + 2 × the bearing marked assumed; a new door in a new wall gives none of
  them; a new door wholly inside an old one to be demolished gives no cut or lintel, and a wider
  one is cut by the difference; an opening up to the wall's top takes no lintel.
- `packages/cli/src/mcp/__tests__/phases.test.ts` still passes (the refurbishment's change).
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders changed, the
  tolerances test and the own-words test.
