# WRT-86: types, finishes and curves in a comparison

## Outcome

`grid diff` and `grid_diff` say every change to a part's type, a room's finishes and a wall's
curve, with figures, and the picture draws a curve that changed:

- A wall, door or window type added, removed or changed is a change line of its own, named by
  its name and id, with its figures (`Wall type "Concrete 250" ("conc") added: thickness 0.25 m;
  taken by wall "ext-east"`), the figures that changed (`thickness 0.30 → 0.25 m`) and the parts
  that take it now (or took it, for a type removed).
- A wall, door or window that takes another type says so in its own line (`type "Brick 300" →
  "Block 200"`), so a type change names its type even where its figures read alone would not.
- A room or zone whose finishes changed is a changed room, in its line and the verdict
  (`floor finish "Oak" → "Tile"; walls finish not stated → "Paint"`), never "Changes: none".
  The faces finished other than the walls and the bands of finish are said the same way.
- A wall whose curve changed says its radius and its bulge before and after, and its sweep
  (`curve radius 3.00 → 3.00 m, bulge 0.414 → -0.414 (sweep 90° → -90°)`); a wall made curved
  or straight gives the curve it has or had. "curve changed" with no figures is gone.
- The comparison picture marks a wall whose curve or type changed as changed: the old curve
  outlined, dashed, under the new one, where it was drawn as unchanged.
- The data carries the same as lists an agent can read: `types`, `finishes` and `curves`.

## Design

- `packages/floorplan/src/geometry/diff/partTypes.ts` (new): `compareTypes` pairs each list of
  `types` (walls, doors, windows) by id, and says each type added, removed or whose fields
  changed, with the parts taking it, by the later ids (the aligned earlier plan's for a type
  removed). `finishChanges` compares two rooms' `finishes` surface by surface, face by wall and
  bands as lists. Pure, its words in `messages/en.ts` (and the draft `es.ts`).
- `packages/floorplan/src/geometry/diff/curves.ts` (new): a curved wall's figures (radius, sweep
  in degrees, and bulge as Grid already reads it in a raw wall: the tangent of a quarter of the
  sweep, positive counter-clockwise; a whole circle has none) and the words of a curve change.
- `props.ts`: a wall's `wallType`, a door's `doorType` and a window's `windowType` are compared,
  so a part that took another type is a change of the id diff. `summary.ts` words a wall's type
  by the types' names and its curve through `curves.ts`.
- `building.ts`: the type lines come after the massing's and before the rooms'; each room
  verdict adds its finish changes (so the room is changed); an opening's line adds its type; the
  `wallType` key is a wall figure in a plan written rooms first; a wall whose `arc` or
  `wallType` changed is marked changed for the picture, which draws its old outline already.
  The verdict says the type lines as it says the massing's. `BuildingComparison` gains `types`,
  `finishes` and `curves`, and `packages/cli/src/versions/diff.ts` puts them in the data.
- No new convention, no new tolerance, no message code, and `rooms/compile.ts` is not touched.
  Loaded plans are compared as read; nothing is changed in place.

## Done

- `packages/floorplan/src/geometry/__tests__/diff-types-finishes.test.ts`: a type added and taken,
  a type's thickness changed (named with its parts), a type removed, a door that takes another
  type, a finish change (room changed, not the same building), a curve flipped to its other side
  and one made deeper (radius, bulge, sweep before and after) and the curve marked changed.
- `packages/cli/src/versions/__tests__/diff.test.ts`: `grid diff` on a plan file whose finish and
  types changed says them, and the data lists them.
- `packages/viewer/src/picture/__tests__/comparison.test.ts`: the old curve outlined.
- Checks: build, typecheck, lint, vitest on the folders touched, ownWords and the languages test,
  the tolerances test, scoreboard not worse.
