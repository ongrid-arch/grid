# LVL-26: a room's height raises or stops its own walls, and has a ceiling

## Outcome

An agent that writes a cinema, a church nave, a fly tower or a double-height hall in rooms text,
with `height <m>` on the room's line, gets walls that stand as high as the room, not the storey's
2.7 to 4 m, and a ceiling at that height. A room lower than its storey (a duct, a roof terrace's
parapet room, a low store) stops its own walls at its height. Only the walls that room bounds
change: a wall between two rooms stands as high as the taller of them, and every other wall keeps
the storey's height.

- A room that would rise into a floor written above it, where a room of that floor stands over it,
  is refused with both lines named, so a nave never silently runs through the gallery floor.
- `walltype 0.05 partition height 2.5` gives every wall of that thickness that height, and a room
  line's `walls 0.05 partition height 2.5` gives the walls that room adds that height: shell-scheme
  booths and low screens in a hall whose storey is 6 m.
- The storey keeps its own height: a wall that stands to the top of a room it bounds that states
  its height is that room's, and a floor that states no height takes its clear height from its
  other walls (all of them only when every wall is a room's), so the raised walls lift neither the
  roof of the rest of the floor nor the floor above. The flat roof Grid lays steps up over a raised
  room to the room's height.
- `grid describe` says each floor's level and storey height, and each room whose floor or height
  is not its storey's says its own (person and agent forms).
- `grid check` warns when a wall of one floor rises past the level of a floor above it where a
  wall of that floor stands in the same place (`wall/same-space`): the same wall counted on two
  floors. Walls a room's own height raises are no longer said to stand above their storey
  (`wall/above-storey`) or to differ from it (`floor/wall-heights-differ`).

A text with no room height, no `walltype ... height` and no `walls ... height` on a room line is
written exactly as before.

## Design

- `packages/floorplan/src/rooms/compile.ts` (owned by this change): a wall's height comes first
  from its wall line, then from its thickness's `walltype ... height`, then from the `walls ...
  height` of the rooms it bounds, then from those rooms' tops (floor offset plus height; a room with
  no height reaches the storey), the tallest of them, and is written only where that differs from
  the storey. Outdoor spaces, virtual walls and railings are left as they are (their edges have
  their own words, WRT-76). On a room line `height` directly after `walls <t> [kind]` is the walls'
  height; anywhere else it is still the room's. The refusal (`rooms/height-into-floor`) is worked
  out on the written plan with the floors stacked by `floorElevations`, after every floor is built.
- `packages/floorplan/src/geometry/sameSpace.ts` (new): the check, run with the stacking checks on
  the whole plan. Walls are in the same place when they are straight, parallel, their bodies
  overlap across and they share a length along of more than the new tolerance `sameSpaceAlong`.
- `packages/floorplan/src/geometry/roomTops.ts` (new): the top of the rooms a wall bounds that
  state their height, and whether the wall stands to it. `elevations.ts` (`tallestDrawnWall`) leaves
  such walls out of the storey's height; `levels.ts` does not ask about them against the storey.
  Decided over writing the floor's height into the plan from rooms text: it holds for plans written
  any way, and a text's plan keeps the fields it had.
- `packages/floorplan/src/geometry/envelope.ts`: a flat roof Grid lays is cut into one facet at the
  storey height and one at each raised room's top; `scene3d.ts` already lays each facet on its own
  plane. The ceiling is VEW-78's, at the room's height.
- `packages/cli/src/describe/`: the facts carry each floor's level and clear height and each
  room's floor level and height; the card says them.
- Words in `messages/en.ts` and `es.ts`; the code in `packages/rules/src/result/catalogue.ts`;
  docs in `docs/rooms-first.md`, `docs/plan-file.md`, `docs/tolerances.md`.
- No new convention in `types/floorplan.ts`: a room's `height` (ARE-10) and a wall's `height`
  already exist; the change is in how rooms text fills them.

## Done

- `packages/floorplan/src/rooms/__tests__/roomHeights.test.ts`: raised and lowered rooms, the wall
  between a tall and a short room, the refusal naming both lines, `walltype ... height`, a room's
  `walls ... height`, the floor's stated height, the stepped roof, the ceiling at the room's height,
  and a text with no heights unchanged; each reads back.
- `packages/floorplan/src/geometry/__tests__/sameSpace.test.ts`: the warning, and none for walls
  that stop at the floor above or stand elsewhere.
- `packages/cli/src/describe/__tests__`: the levels and heights said.
- Code table and catalogue contract, `ownWords.test.ts`, the tolerance table test, floorplan's
  purity test.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders changed, `npm run scoreboard`.
