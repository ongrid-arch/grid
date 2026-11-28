# 2026-11-28: walls and slabs with earth against them, and the dig, in the take-off (ARE-77)

## For people

- A basement, a car park under a building or a house cut into a slope is measured for what is
  buried: the walls below the ground are retaining walls, listed by the height of earth they
  hold, and no longer outside face to render; the slab over a basement reaching out under the
  garden is a buried slab with the soil over it, not a roof; every slab resting on the ground,
  on whichever floor, is a ground-bearing slab, not an upper floor; and the dig is given in
  cubic metres. The inside face of a wall with earth behind it is its own line, not plaster
  (ARE-77).

## For agents

- `grid_takeoff`: new `earth` in its data on a plan with anything in the earth (`retaining` by
  `retained` height with `area`, `length`, `count` and `floors`; `buried` with `area` and
  `cover`; `bearing`; `dig` with `depth` and `volume`; `excavation` in m³; `state: assumed`), its
  lines under "In the earth" and its rows in the CSV (`retaining wall`, `buried slab`,
  `ground-bearing slab`, `excavation`), and its rule. Each envelope line's `slab` adds `onGround`,
  a floor may add `buried`, and a roof the ground covers is null and out of `envelope.roof`. A room
  on a retaining wall adds `earthFace`, out of its `wallFace`.
- `for=estimate`: new lines `retaining_wall:<height>`, `retaining_face`, `buried_slab` and
  `excavation` (unit `m3`, a new rate unit); `external_finish`, `wall:<kind>` and
  `wall_finish:<use>` leave out what is against the earth; `slab` takes every ground-bearing slab
  ("Ground-bearing slabs (…)" when one is off the lowest level) and `upper_floor` its share less.
- New tolerance `buriedSlabAboveGround` (0.3 m) in the tolerances table. No new code in the record.
