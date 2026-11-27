# 2026-11-27: floor-to-floor heights, and warnings when heights conflict (LVL-24)

## For people

- A building's floors can be given their floor-to-floor, the distance from one floor level to the
  next, once for every floor or floor by floor, and Grid stacks them by it: a forty-storey tower at
  3.9 m floor to floor is 156 m high, with no elevation added up by hand. Each floor's walls meet
  the slab over it, and the rooms' ceiling height can be set in the same step. Writing a plan of
  more than one level now lists each floor's level and floor-to-floor, and the building's height
  with what it is measured from (LVL-24).
- `grid check` warns when a floor's height, which is its clear height, runs with the slab over it
  past the floor over it (a floor-to-floor written as the height), and when walls a storey high
  state another height than their floor, saying which won (LVL-24).

## For agents

- New tool `grid_set_levels` (after `grid_place_building`; the server lists 64 tools):
  `floorToFloor` (metres, or text with its unit) on every floor, one `building`'s or the `floors`
  listed, written as the floors' `elevation`; the lowest floor at or above level 0 keeps its level,
  and the floors over a floor set move with it, keeping their own. Each floor set gets the
  floor-to-floor less the slab over it as its `height` (the answer names a height it replaces);
  `ceiling` sets the `height` of the rooms on those floors. Refused, writing nothing: a
  floor-to-floor no taller than the slab over it, a ceiling that does not fit under it, an unknown
  floor or building, and a call that changes nothing. Its answer's `levels` lists every floor's
  `level`, `floorToFloor` and `clearHeight`, with its `building`. No new field in the plan file.
- `grid_write_rooms` and `grid write` answer, for a plan of more than one level, with the levels:
  each floor's level, floor-to-floor and clear height (a run of equal storeys as one line), and the
  building's height from the ground floor's floor level, the site's ground or its pad.
- A change of a floor's field through `parts` (`grid_set` on a floor, `grid_set_levels`) now reads
  the walls that take their floor's height again, so the answer and its checks see the new height.
- New code `floor/height-past-next` (`worth-a-look`, on the lower floor): the floor states its
  `height`, and that with the slab of the floor over it (its `slab`, else 0.25 m) reaches past that
  floor's level by more than `sameFloorLevel`. The line names both floors, the height, the slab,
  where they reach, the level and the clear height that fits. Not said where
  `floor/walls-past-floor` is said for the floor.
- New code `floor/wall-heights-differ` (`worth-a-look`, on the floor): the floor states its
  `height`, and walls on it at least `storeyLowest` high state another of their own (not taller
  than `wall/above-storey` lets pass). Said once per floor, with the walls' count and figures, and
  how many walls take the floor's height. Each wall's own height wins.

## Codes

| `floor/height-past-next` | {thing} states a clear height that, with the slab over it, runs past the floor over it | a clear height no more than the floor-to-floor less the slab of the floor over it |
| `floor/wall-heights-differ` | {thing} has walls that state another height than the floor does | a storey's height stated once: on the floor, or on its walls |
