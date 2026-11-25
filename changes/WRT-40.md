# 2026-11-25: the rooms read-back writes the height walls state, never a roof's ridge (WRT-40)

## For people

- `grid describe --as rooms` writes on its walls line only a height the walls state themselves. A wall that rises to its floor's roof is no longer given the roof's ridge as its height, so writing the read-back again changes no wall, and a floor beside a roofed one is no longer written in Grid's own terms for it (WRT-40).

## For agents

- `grid_describe` and `grid describe --as rooms`: the `walls outside … inside …` line's `height` is the most common height among the walls that state their own; a height a wall takes from its floor's `height` or rises to under its floor's `roof` is left to the floor line and `raw floor`. A wall line says `height` only for a wall that states one. Floors that were written as `raw` lines only because of that height are now rooms text, and `prefer: 'rooms'` no longer lists those walls as changed. No new code in the record.
