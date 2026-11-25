# 2026-11-25: a storey's walls meet the slab over them, and a gap is said (VEW-33)

## For people

- Under another floor, a storey's top is that floor's slab. A basement or a car park whose walls,
  by the heights and elevations the plan states, stop short of the slab of the floor over it is no
  longer drawn with a white band through its walls: sections and facades draw its full-height
  walls up to the slab, or to the flat roof Grid lays over them, and the section lists the walls
  it raised. A dwarf wall or a parapet keeps its own height. `grid check` says the gap, with both
  floors and the figures, and says walls that rise past the floor over them into the storey
  above. Walls stated floor to floor, into the slab, are not said (VEW-33).

## For agents

- New code `floor/gap-under-slab` (`worth-a-look`, on the lower floor): the floor's tallest drawn
  wall stops short of the underside of the slab of a floor over it (that floor's level less its
  `slab`, else 0.25 m) by more than `sameFloorLevel`. The line names both floors, the gap, the
  walls' top and the slab's underside. The floors paired are those `floor/out-of-line` and
  `floor/set-back` set against each other; a floor marked `overhang: "meant"` is paired too.
- New code `floor/walls-past-floor` (`worth-a-look`, on the lower floor): that wall rises past
  the floor level of the floor over it, into the storey above, by more than `sameFloorLevel`.
  Walls that run into the slab and stop in it get neither line.
- `grid_view kind=section` (and `grid draw --section`): a wall at its storey's full height (its floor's
  tallest drawn wall, or one whose height nothing states) that stops short of the slab of another
  floor over it, or of the flat roof Grid lays over it, is cut and seen up to its underside. New
  `assumed` kind `wall-top`, marked (`hatched: true`): per floor and what is over it, the walls
  raised and the largest rise, its `pieces` the strips added. Facades (`grid_view kind=facade`)
  draw those walls' faces to the same top.

## Codes

| `floor/gap-under-slab` | {thing} stops short of the slab of the floor over it | walls that meet the slab of the floor over them: their top at that floor's level less its slab |
| `floor/walls-past-floor` | {thing} has walls that rise past the floor over it | walls that stop at or under the level of the floor over them |
