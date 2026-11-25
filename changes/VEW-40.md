# 2026-11-25: describe leaves out a line with nothing in it (VEW-40)

## For people

- `grid describe` no longer prints "Not in the plan: ." when the plan already says where north is
  and what kind of building it is; the line is left out (VEW-40).

## For agents

- `grid_describe` leaves out the `NOT IN PLAN` line of the agent's form, and the "Not in the plan"
  line of the person's form, when nothing is unsaid. No new code in the record.
