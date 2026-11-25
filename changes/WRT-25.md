# 2026-11-25: a floor moved up or down is a change, in the write verdict and in grid diff (WRT-25)

## For people

- A floor that stands at another height, or has another level, height or slab, is now a change
  with its old and new figures. `grid write` of a mezzanine moved from 13.75 m to 4.25 m no
  longer answers "the same building as the plan before": it says `… but floor "Mezzanine" moved
  down 9.50 m: elevation 13.75 m → 4.25 m.` `grid diff` says the floor first, in its verdict too,
  instead of counting it as a "wall or opening change". A floor that states no elevation and
  moved because a storey under it got taller says where it stands now (WRT-25).

## For agents

- `grid_write_rooms`, `grid write` and every change answered with a verdict: a floor in both
  versions that moved up or down, or changed its level, elevation, height, slab or name, is named
  with its figures. With every wall, opening and room in its place the verdict is `<after> has the
  walls, openings and rooms of <before>, each in its place, but floor "<name>" moved down <m> m:
  elevation <old> m → <new> m.`, never "the same building"; moved, mirrored or turned on the
  drawing, the floor follows "but"; otherwise it is a part of the list. `grid_compare`'s
  comparisons carry `floorsChanged` (floors paired by id, then by name).
- `grid_diff` and `grid diff`: such a floor is a floor line, first, and in the verdict (`Floor
  "<name>" moved up|down <m> m: …`, or `Floor "<name>" <changes>` when it did not move), never
  counted as a "wall or opening change"; `sameBuilding` is false. A floor stating no elevation
  says `standing at <old> → <new> m`, worked out as the 3D view stacks it. The answer's data has
  `floors`: `floor`, `name`, `renamedFrom`, `level`, `elevation`, `height`, `slab` (each
  `{before, after}` or null, a figure not stated is null) and `stands` (`{before, after}` in
  metres, or null). No new code in the record.
