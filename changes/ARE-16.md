# 2026-11-25: a void adds no floor area and no floor, ceiling or skirting (ARE-16)

## For people

- A room marked as a void, open to the floor below, is no longer counted as floor. It adds nothing to the net, gross internal or gross external area of its floor, to the floor, ceiling or skirting of the take-off, or to the "inside in all" of a write's summary. A cabin of 18 m² with a loft void no longer reads 36 m² gross internal. The void is still listed with its size, and its open edge is given as a guard length in the take-off.

## For agents

- `grid_areas` and `grid_describe`: a room with `void: true` is listed with its `net` and `void: true`, and is in no net, by-use, gross internal or gross external total. A floor's figures carry `voids`, its floor, which both gross figures are taken less. The rule text of the three measures says so.
- `grid_takeoff`: a void's room has `floorArea`, `ceiling` and `skirting` of 0, keeps its `wallFace`, and has `void: true` and `guard`, the metres of its edge on a dividing line or no wall plus the width of every door and doorless opening in its walls. `totals.guard` is their sum and is left out on a plan with no void. Finishes and the estimate follow, as they read the same take-off.
- The summary of a write leaves outdoor space out of "inside in all" and says how many rooms and how much floor it left out.
- No new code in the record.
