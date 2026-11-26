# 2026-11-26: add a door, window or opening to a plan that already has its walls (WRT-72)

## For people

- `grid edit add-opening` puts a door, window or doorless opening in a side of a room
  (`--room bath --side north`) or in the wall two rooms share (`--room hall --between living`),
  centred or placed from a side (`--from west --distance 0.25`), with `--width`, `--height`,
  `--sill` and `--kind`. A door can say the room it opens into and its hand. It adds only that
  opening, so it works over a plan with phases (the opening is new work) and over parts written
  by hand, where writing the whole plan again from rooms text is refused (WRT-72).

## For agents

- New tool `grid_add_opening` (the tool server now lists 38): `type` (door, window or opening)
  and `room` with `side` or `between`; optional `from` and `distance`, `width`, `height`, `sill`,
  `kind`, `opens_into`, `hinged`, `seen_from`, `id`, `out`. Sizes default as rooms text's do. A
  width that does not fit, a wall that is a dividing line or curved, two rooms that share no
  wall and a taken id are refused with nothing written, the first naming the wall's free
  stretches. A door given neither `opens_into` nor a kind that needs no swing is drawn with no
  swing, and the answer says so. No new code in the record.
