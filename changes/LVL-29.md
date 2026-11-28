# 2026-11-28: roof overhangs, canopies and brise-soleil (LVL-29)

## For people

- A roof can run past its walls: `overhang 0.6` on a rooms text roof line, all round, or
  `overhang north 0.3 south 0.9` side by side. A pitched roof's slopes carry on over the overhang,
  so its eaves come down lower at the edge, and the overhang stops where a floor above stands. The
  3D view, the GLB and OBJ files, the floor plan (a dashed line past the walls), elevations and
  sections all show it, and the take-off's roof area includes it (LVL-29).
- A roof can have parts on its sides: `canopy entrance south depth 1.2 height 2.4 width 3` is a
  level canopy out from the south walls, and `brise-soleil shade west depth 0.8 height 2.6
  blades 6` a row of sun-shading blades. Each runs the whole side unless its width says, and is
  drawn with the roof in the same views. They are not roof area.
- An elevation of a pitched roof that states its overhang draws that overhang instead of its fixed
  0.3 m.

## For agents

- `floors[].roof` takes two optional fields: `overhang` (metres, or `{ north, east, south, west }`,
  each 0 or more) and `parts` (each `{ id, kind: "canopy" | "brise-soleil", side, depth, height,
  width?, at?, blades? }`). Rooms text writes them with `overhang` on the roof line and the
  `canopy` and `brise-soleil` lines under it; the read-back writes them back the same way.
- `grid_set`: `roof` words take `overhang`; a new argument, `roofPart`, takes a canopy or
  brise-soleil line's words for one floor and adds the part to its roof, or replaces the part with
  that id. Changing the roof's words with one floor named keeps its parts, as it keeps its roof
  lights and dormers.
- The envelope's roof (`planEnvelope`): `pieces`, `area`, `facets` and `slopeArea` include the
  overhang, and `overhangArea` says what it adds; each part is one more facet, marked `part`, at its
  own height, and `parts` counts them. `floorAbove` gives the roof's edge past the walls among its
  dashed lines.
- New code `floor/roof-part-misplaced` (`worth-a-look`): a canopy or brise-soleil whose width, round
  its `at`, takes in no outside wall on the side it names; it is left out.

## Codes

| `floor/roof-part-misplaced` | {thing} has a canopy or a brise-soleil with no outside wall to stand out from | a canopy or a brise-soleil whose width, round its at point, takes in the outside walls on the side it names |
