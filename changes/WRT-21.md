# 2026-11-25: a door keeps its sill when its width or swing changes (WRT-21)

## For people

- Widening a door or changing its swing no longer resets its threshold to zero (WRT-21).

## For agents

- `grid_change_opening` changes only what was asked: a door's `sill` stays unless you pass `sill` or turn another opening into a door. No new code in the record.
