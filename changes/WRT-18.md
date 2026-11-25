# 2026-11-25: every change refuses a new drawing problem, and a side move offers the move that fits (WRT-18)

## For people

- A change to the plan that would leave the drawing with a problem it did not have is now
  refused and nothing is written, whatever the problem: a side moved past the opposite wall, a
  wall that would end inside a door, a door widened across the wall that meets its wall into the
  next room. Before, only the most serious problems stopped a change, and the others were
  written. A side that cannot move as far as asked is refused with the largest move that fits,
  and a wall drawn to the face of the moved wall now moves with it (WRT-18).

## For agents

- `writeChange`, behind every tool that changes the plan, refuses a change whose drawing has a
  problem the plan did not have, of any severity, matched by code and part (`validatePlan`); a
  problem that only changes its figures is not new, and a fixture's fit (`item/` warnings) is
  still answered by `grid_place_item`, not refused. The refusal names up to three problems in
  their own words and how many more.
- `grid_move_room_side` refused says `The largest move that fits is by <m> m, to <m> m inside.`
  (or `No move that way fits.`): call it again with that `by`. A move that would leave a room on
  the moved wall less than 0.30 m across is refused the same way. A wall that ends on the moved
  wall's face, not only on its centre line, follows it and is named among the walls that followed.
- No new code in the record.
