# LVL-29: roof overhangs, canopies and brise-soleil

## Outcome

A floor's roof (LVL-6) ended on the outside faces of its walls: no eaves past them, no canopy
over a door, no sun shading on a side. Agents faked an overhang with a second floor called
"Roof" or a roofed terrace, and a picture had to trim the roof by hand. Now:

- A roof states how far it runs past its walls, in metres, all round or per side:
  `roof gable pitch 40 eaves 2.7 overhang 0.6` or `... overhang north 0.3 south 0.9`. The roof's
  planes carry on past the walls, so a pitched roof's eaves come down lower as they go out, as
  built. The roof stops where a floor above stands.
- A roof has parts on its sides: a `canopy` (a level slab out from a side, at its own height) and
  a `brise-soleil` (a row of blades parallel to the side, out from it, at its own height):
  `canopy entrance south depth 1.2 height 2.4 width 3 at 4,0`, `brise-soleil shade west depth 0.8
  height 2.6 blades 6`. Unstated, a part runs the whole side, and a brise-soleil's blades are
  spaced by Grid's own figure.
- Both are drawn: in 3D, GLB and OBJ with the roof; on the floor's plan as a dashed outline where
  they run past the walls; in elevations and sections where the roof already is. A stated
  overhang replaces the fixed overhang the elevation drew for a pitched roof.
- Both are set by rooms text and by `grid_set` (`roof` words take `overhang`; a new `roofPart`
  argument takes a canopy or brise-soleil line's words), refused with the fix when a word or a
  figure is wrong, and read back as rooms text so nothing is lost.
- The roof's area in the take-off is the roof with its overhang; canopies and brise-soleil are
  not roof area. A part that finds no wall on its side to stand out from is named by the check.

## Design

- `types/floorplan.ts`: optional fields on the existing `RoofSchema` only: `overhang` (metres,
  or per side `{north, east, south, west}`) and `parts` (`RoofPartSchema`: id, kind `canopy` or
  `brise-soleil`, side, depth, height, optional width, at and blades). No new convention.
- `geometry/roofParts.ts` (new): the stated overhang per side in the roof frame's terms, the
  roof's pieces grown by it (a Minkowski sum with the rectangle of the four overhangs, cut back
  by the floors above), and each part's place: its back edge on the outline's furthest edge in
  its width, its blades.
- `geometry/envelope.ts`: the roof's pieces and facets include the overhang; each part is one
  more level facet marked `part`, so the 3D roof solid (and with it GLB and OBJ) carries it.
  `area` and `slopeArea` leave the parts out; `overhangArea` says what the overhang adds.
- `geometry/facade.ts`, `geometry/section.ts`: the stated overhang is used instead of the fixed
  projection; parts drawn as bands and cuts at their height.
- `geometry/above.ts`: the floor's own roof and parts past its outline join the dashed lines.
- `geometry/validate.ts`: `floor/roof-part-misplaced` (warning) with its catalogue entry.
- `rooms/roofs.ts` + `rooms/compile.ts` (owned by this change): `overhang` on the roof line, the
  `canopy` and `brise-soleil` lines, and read-back (`roofLines`).
- `cli/src/mcp/setTool.ts`: `roofPart` words; the roof's parts kept when the roof words change.
- Figures in the tolerance table: the largest overhang and part depth, and a brise-soleil's
  blade spacing and blade width.
- Decision: a canopy belongs to the roof of the floor it stands out from, so a canopy over a
  ground-floor door under an upper floor needs the ground floor to state its (flat) roof. A
  canopy on a floor with no roof would be a new convention, left for a person.

## Done

- Tests in `rooms/__tests__` (words, refusals, read-back), `geometry/__tests__` (pieces grown
  per side, cut by a floor above, parts placed, 3D solid, facade and section, dashed lines) and
  `cli/src/mcp/__tests__` (grid_set roof overhang and roofPart).
- build, typecheck, lint, the touched folders' tests and the scoreboard pass.
