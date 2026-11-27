# 2026-11-27: glass, ceilings and finish tints in the 3D view and its stills (VEW-78)

## For people

- The 3D view, the stills and the preview draw glass see-through and tinted: every window, a door
  whose type is glazed (a glazed sliding door's leaves are glass) and a glazed wall. A view taken
  standing in a room shows the room's ceiling at its height instead of empty background, its walls
  at full height, and a plain sky through the glass. Floors, wall faces, feature walls, bands and
  ceilings are tinted by their finishes where the finish's name gives a colour or material, such
  as "Oak boards", "Grey tile" or "Sage paint" (VEW-78).

## For agents

- `grid_view kind=eye` lists a door whose type is glazed with the windows ("glazed door"), and its
  `sills` entries carry `type` (`window` or `door`). It says "The room has no windows." only when
  the room has no window and no door; when its doors are not marked glazed it says they are drawn
  solid and that `grid_change_type` with `glazed` true marks a door type as glass. Its text no
  longer says the view has no ceiling or glass.
- `grid_measure what=sun` counts a door whose type is glazed (`glazed`, or a glass `material`) with
  the windows, marked "(glazed door)" and `door: true` in the data; a window whose type states
  `glazed: false` is no longer counted.
- The stills: a camera standing in a room draws its floor whole (not cut at 1.2 m as a cutaway),
  with each room's ceiling, and a sky behind the glass. New tolerance table entries `liningOnFace`
  and `liningOffset`. No new code in the record.
