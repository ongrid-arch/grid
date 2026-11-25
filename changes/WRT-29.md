# 2026-11-25: an opening that moved is said to have moved, in change verdicts and grid_compare (WRT-29)

## For people

- A door or window that moved is said to have moved, and how far, in the answer of every change,
  of `grid write` and in `grid_compare`: `door "front" moved 2.88 m along its wall`, `window "w4"
  moved 0.60 m with its wall`, `14 windows moved 0.60 m with their walls`. Before, a door moved
  along its wall was answered "the same building ... every opening where it was", and a window
  that moved with its wall was not named (WRT-29).

## For agents

- The verdict of every change, of `grid_write_rooms` and `grid write`, and `grid_compare`'s
  comparisons pair openings as `grid_diff` does: by place, then at their place along a wall that
  moved, then by id. An opening under its id in another place is no longer "where it was": the
  plans are not the same building, and the verdict names the move with how far, one opening by id
  (`door "front" moved 2.88 m along its wall`), more counted (`3 windows moved 0.30 m along their
  walls`, `4 openings moved 0.30 to 1.00 m`). "N openings changed" counts the other changes only.
- Each entry of `openingsChanged` in `grid_compare` carries `moved`: how far the opening's middle
  moved on the drawing, in metres, or null; its `changes` say `moved 2.88 m along its wall`,
  `moved 0.60 m with its wall` or `moved 1.20 m`, and `was a door` for an opening of another type
  under the same id.
- No new code in the record.
