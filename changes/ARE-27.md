# 2026-11-25: one clear-width rule for doors, leaf by leaf (ARE-27)

## For people

- A door is now judged the same way by the brief, the accessibility measurements, a firm's door standard and `grid check`: by its clear width, leaf by leaf, unless the brief says the figure is for the leaf or the hole. Each leaf of a double door has its own clear width, a sliding, pocket, roller or garage door keeps its whole opening, and `grid check` lists the figures of your brief the drawing misses. A firm's figure now carries the firm's own note on where it comes from (ARE-27).

## For agents

- The clear width of a door (`use/doorway-clear-width`, `grid_measure what=access`, `firm/door-clear-width`) is measured leaf by leaf. A `double` door with `opens` is judged by that active leaf; one with no `opens` opens both leaves, each taking `useOpenLeaf`, so a 1.8 m pair leaves 1.70 m. A single door with `opens` beside a fixed panel is judged by the part that opens. A `sliding`, `pocket`, `roller` or `garage` door takes no allowance and leaves its whole hole.
- `grid_write_brief`: `door_width` takes `measure`: `clear` (left out, the default), `leaf` or `hole`. Its lines set every door against that width, the same width `grid_measure what=access` uses, and say which width they measured, with each leaf of a pair. Before, the brief set a door's hole against the figure.
- `grid_measure what=access`: each door in `doors` has `leaves` (each with `from`, `to`, `width`, `allowance`, `clear`, `active`) and `judgedBy` (`leaf`, `pair` or `hole`). An `against` entry for the person's `door_width` carries `measure`, and its line says "for its clear width" (or leaf width, or hole).
- `grid check` and `grid_check` list the person's own figures in the brief beside the plan that the drawing misses, after the report, under "The person's own figures missed". They are text lines only: the record gains no code for them.
- On a `firm/` line, `firm` carries `note`, the firm's own note on where its figure comes from (or null), and `needed` says it. No new code in the record.
