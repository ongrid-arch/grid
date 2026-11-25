# WRT-20: floors added and removed, said by grid diff

## Outcome

`grid diff` and `grid_diff` say a floor that was added or removed in one line, with its rooms
and their area: `Floor added: "First floor", 2 rooms, 26.32 m²`. A plan that gained a floor no
longer says every room of the floor it had was moved to the ground floor: a room whose floor was
unstated before and is stated as the ground floor now (or the other way round) stands on the
same floor and is as it was.

## Design

- `packages/floorplan/src/geometry/diff/building.ts`, `compareBuildings`:
  - The bug: a room's floor was compared as written (`floor ?? ''`), so a room with no floor
    (the ground floor, C5) and the same room stating `floor: "ground"` were said to be "moved to
    floor "ground"". This is what happens when a plan of one floor, written with no floor line,
    is written again with a `floor ground` line and a floor above it. The floor is now read
    through `floorOf` (`geometry/floors.ts`), as the id diff (`props.ts`) already does, both for
    a room's verdict and for the walls an opening may be crossed by (`crossedOpenings`).
  - A floor added or removed is said with the rooms on it, by count, and their net area, as
    `grid_areas` gives it (`planAreaFigures`'s figure for that floor, so zones, outdoor spaces
    and stair rooms are counted as they are there), from the later plan for a floor added and
    the earlier one for a floor removed. A floor with no rooms says "no rooms". The id diff's
    own summary (`summary.ts`, "Floor added: "First floor"") is left as it is: it has no areas.
  - The floor lines come first in the change lines, before the room lines, and the verdict
    says them first too: a room on a floor added or removed is counted in its floor's line and
    not said again in the verdict (it keeps its own change line and its verdict in `rooms`).
    They are no longer counted as "wall or opening change". A floor renamed or given another
    level is left where it was (among the wall lines), as before.
  - Decision: the area figure is the floor's net area, said as "m²" with no word for the
    measure, as a room line says its net area.
  - Decision: a diff between phases (`grid diff --since phase`) reads the earlier side's floor
    areas through `planAreaFigures`, which reads a plan after the work; a floor added or removed
    between phases is not a case Grid's phases make, so this is left.
- The words: new keys `diff.floor.*` in `packages/floorplan/src/messages/en.ts` and `es.ts`,
  said with `english`, so `building.ts` gains no English sentence of its own.
- `packages/cli/src/versions/diff.ts` needs no change: it prints the verdict, the rooms and the
  change lines the comparison gives.
- No new convention, no new message code.

## Done

- `packages/floorplan/src/geometry/__tests__/diff-floors-added.test.ts`: a house of one floor
  written with no floor line, against the same house with a `floor ground` line and a first
  floor copied from it: the ground floor's rooms are as they were, the first line is `Floor
  added: "First floor", 2 rooms, …` with the rooms' net area, the verdict says it first and
  does not say "moved to floor"; the other way round it says `Floor removed: …`. A room really
  moved to another floor is still said to be moved. A floor with no rooms says "no rooms". The
  words in Spanish come from `es.ts`.
- `packages/cli/src/versions/__tests__/diff.test.ts`: `grid diff` against a marker set before a
  floor was added prints the floor line and no "moved to floor".
- `npm run typecheck`, `npm run lint`, the floorplan and cli test folders,
  `ownWords.test.ts`, and `npm run scoreboard` (no count is expected to move).
