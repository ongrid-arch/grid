# 2026-11-27: curved rooms and walls in rooms text (WRT-78)

## For people

- Rooms text writes curved rooms in a few words: `circle 12 at x,y` (or `circle radius 6`), `oval 60 x 36 at x,y`, a round end on a side of a room (`arc 180 east of nave`), a band between two radii round a centre (`band 6.1 to 10 from 0 sweep 180 at x,y`) and a bowed side (`wall hall east curve radius 18`, `inward` to bow it in). Grid works out true curved walls, one where two rooms share a curve, and doors and windows go on them like on any other wall (WRT-78).

## For agents

- `grid_write_rooms` and `grid write` take `circle`, `oval`, `band` (placed by the centre, `at x,y`) and `arc <degrees> [<chord>] <side> of <room>` on a room line, and `wall <room> <side> curve radius <r> [inward]`. The plan gets walls with `arc` (C21), never many short straight walls. An opening on a curved wall is `centred` on the curve's point that faces the side named (between two rooms, the middle of their shared curve) or `<m> from <side>` along the curve; its `offset` and `width` are along the arc. A curved room's area in the answer is its curves' true area. Refusals use `rooms/syntax`, `rooms/size` and `rooms/no-side`; a circle or oval placed beside a room is refused, with the place by its centre to write instead. `grid describe --as rooms` still gives a floor with curved walls in Grid's own JSON. No new code in the check record.
