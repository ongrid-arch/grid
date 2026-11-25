# 2026-11-25: grid_view draws the parts to be demolished (VEW-14)

## For people

- A picture of a refurbishment plan from the tool server now shows what `grid draw` shows: walls,
  doors and windows to be demolished drawn dashed, with "to be demolished" in the key (VEW-14).

## For agents

- `grid_view kind=plan` draws the plan as stated, so parts to be demolished are in the picture and
  in its `boxes`, and its text gains one line on a plan with phases: how many parts are to be
  demolished (walls, openings, rooms), the same count `grid_check` gives, and how many are new.
- `highlight` accepts the id of a part to be demolished. Measures and checks still read the
  building after the work. No new code in the record.
