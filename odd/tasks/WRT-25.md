# WRT-25: a floor that moves up or down is a change, in the write verdict and in the diff

## Outcome

A floor that stands at another height, or has another level, height or slab, is said to have
changed, with its old and new figures, wherever Grid says what a change did:

- `grid write`, `grid_write_rooms` and every change that answers with a verdict no longer say
  "the same building as the plan before" when a floor moved. Writing a mezzanine at elevation
  4.25 m where it was at 13.75 m answers: `The plan now has the walls, openings and rooms of the
  plan before, each in its place, but floor "Mezzanine" moved down 9.50 m: elevation 13.75 →
  4.25 m.`
- `grid diff` and `grid_diff` say it as a floor line, first, in the verdict too, and no longer
  count it as a "wall or opening change": `Floor "Mezzanine" moved down 9.50 m: elevation 13.75
  → 4.25 m`.
- A floor that states no elevation and stands elsewhere because the floors under it changed
  (a lower storey made taller, a level changed) says where it stands now, worked out as the 3D
  view and the IFC stack it: `Floor "Mezzanine" moved up 9.00 m: standing at 4.25 → 13.25 m`,
  when the ground floor under it was made 13 m high instead of 4 m. A level changed is said as
  `level 1 → 2`, and where the floor stands only when that moved it (levels are an order).
- The answers carry the figures as data: `floors` in `grid_diff`'s answer and `floorsChanged`
  in `grid_compare`'s comparisons.

## Design

- `packages/floorplan/src/geometry/diff/floors.ts` (new): `floorChanges(earlier, later)`, the
  floors in both versions paired by id (and, for two plans written apart, by name after that),
  each with what changed: its name, its `level`, the `elevation`, `height` and `slab` it states,
  and where its floor stands as `floorElevations` works it out (`stands`). Each change carries
  its line as a sentence by key (`said`, starting "Floor …") and the same words for the middle of
  a sentence (`inSentence`, "floor …"). The move up or down is said from `stands`, so a stated
  and a worked-out move read alike; "standing at" is added only when the elevation is not stated
  in both versions (with it stated, the elevation already says where the floor is). Same
  tolerance as the id diff's floor figures (`diffLength`).
  - Decision: worked-out heights are read only when the plans have more than one floor between
    them; a plan of one floor stands at 0 unless it states an elevation, which is compared.
  - Decision: a floor added or removed is left to what says it today (WRT-20's floor lines; in
    the write verdict, the rooms on it).
- `packages/floorplan/src/geometry/diff/building.ts`: a floor in both versions that changed is
  said by `floorChanges` among the floor lines (first, and in the verdict), not as the id diff's
  summary among the wall lines; a floor that only moved because of the floors under it is a line
  too, so `sameBuilding` is false. `BuildingComparison.floors` holds the figures.
- `packages/cli/src/quantities/compare.ts` (`comparePlans`, the write verdict and
  `grid_compare`): the floors are compared too. With every wall, opening and room in its place
  and a floor changed, the verdict is the new sentence above, never "the same building"; moved,
  mirrored or turned, the floor changes follow "but", as walls of another height already do;
  otherwise they are parts of the list. `Comparison.floorsChanged` holds the figures.
- `packages/cli/src/versions/diff.ts`: `floors` in the answer's data.
- The words: keys `diff.floor.*` and `compare.same.floors` in `packages/floorplan/src/messages/en.ts`
  and `es.ts`, said with `english`, so no file gains an English sentence of its own.
- No new convention, no new message code.

## Done

- `packages/floorplan/src/geometry/__tests__/diff-floor-levels.test.ts`: a warehouse written rooms
  first with a mezzanine at 13.75 m against the same at 4.25 m: `compareBuildings` is not the
  same building, its first change line and its verdict say `Floor "Mezzanine" moved down 9.50 m:
  elevation 13.75 → 4.25 m`, and no "wall or opening change"; a level changed with no elevation
  stated says the level and where the floor stands; a lower storey made taller moves the floor
  above it; nothing changed is still the same building; the Spanish words come from `es.ts`.
- `packages/cli/src/quantities/__tests__/compareFloors.test.ts`: `comparePlans` on the same two
  plans does not say "same building" and says the move with both figures, and `floorsChanged`
  has them.
- `packages/cli/src/command/__tests__/write.test.ts` or `versions/__tests__/diff.test.ts`:
  `grid write` of the moved mezzanine answers with the move; `grid diff` says the floor line.
- `npm run typecheck`, `npm run lint`, the floorplan and cli test folders, `ownWords.test.ts`,
  `contract.test.ts` and `npm run scoreboard`.
