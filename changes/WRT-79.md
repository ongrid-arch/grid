# 2026-11-27: roofs, roof lights, columns and a plinth in rooms text (WRT-79)

## For people

- Rooms text writes a floor's roof in one line, `roof gable pitch 45 eaves 2.7` (flat, gable, hip or mono-pitch, its pitch or ridge, `ridge runs east-west`, `high north`), its roof lights over a room (`rooflight r1 over kitchen, 1.2 x 0.8`), the plan's columns (`column c1 round 0.5 at 6,4`) and grids of them (`columns c 0.4 at 6,5, count 4 x 3, every 6 x 8`), and the plinth a building stands on (`plinth 0.6`, the same as `ground -0.6`). Reading a plan back as rooms text gives these lines again, with no JSON (WRT-79).

## For agents

- `grid_write_rooms` and `grid write` take `roof <flat|gable|hip|mono-pitch> [pitch <degrees> | ridge <m>] eaves <m> [ridge runs east-west|north-south] [high <side>]` and `roof none` under a floor line (the floor's `roof`), `rooflight <id> over <room>, <w> x <l>` or `at x,y, <w> x <l>` (its `rooflights`), `column <id> [square|round] <w> [x <d>] at x,y [turn] [height] [through <floor>] [on <floor>] ["<label>"]`, `columns <group> ... at x,y, count <n> [x <m>], every <s> [x <s>]` and `raw column {...}` (the plan's `columns`, named `<group>-1` and on), and `plinth <m>` (`site.ground` = -m). Column lines replace the file's columns; a text with none keeps them. `grid describe --as rooms` writes a roof with no dormers as roof and rooflight lines, not `raw floor`, and columns as column lines. `grid_set` takes `roof`, the words of a roof line (`none` takes it off; with one floor named, its roof lights and dormers stay). Refusals use `rooms/roof`, `rooms/column`, `rooms/duplicate-id` and `rooms/unknown-floor`. No new code in the check record.
