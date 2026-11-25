# 2026-11-25: roofs worked out from the floors' elevations, not their order (LVL-15)

## For people

- A floor is roofed only where nothing of the building stands over it, at any height, read from
  where each floor stands rather than from the order of its `level` (LVL-15). A split-level
  house, a half-level car park or a row of split-level houses up a sloping street gets a roof
  over the top half-level of each part and none over the half-levels other floors stand on: the
  section, the facade, the 3D view, the exports and the take-off no longer call a floor with
  bedrooms on it a roof. A step of a stepped house that shares its level with another floor but
  stands at its own elevation is roofed on the tops of its own walls, not at the height of the
  tallest wall of the level, unless the floor states its height.

## For agents

- `grid_view` (its sections, facades and 3D), `grid_takeoff` and every export read roofs from the
  envelope, which now takes off every floor whose floor level stands higher (by more than
  `sameFloorLevel`), lowest first, instead of only the floors on the next `level`. A plan whose
  floors stack in order gives the same roofs as before.
- A roof's `under`, in the library's `planEnvelope`, lists the floors that took a part of it off,
  rather than every floor on the next level. A floor above whose outline cannot be worked out
  makes a roof unknown only when its walls stand over that floor's outline.
- A flat roof's `bottom`, on a floor that shares its level with another and states no `height`,
  is its floor level plus its own tallest wall.
- No new code in the record.
