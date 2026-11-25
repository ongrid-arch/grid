# 2026-11-25: wall faces under a gable are measured under the roof in the estimate and wall-type totals (CNT-34)

## For people

- Under a roof a floor states, the estimate's wall lines, its outside face and the wall-type totals
  now measure each wall by its face under the roof, as the room take-off already did, so a gable end
  is no longer left at its stated height. The gable part, above the lowest the walls' tops stand,
  has its own lines (CNT-34).

## For agents

- `grid_takeoff for=estimate` has `wall_gable` and `external_finish_gable` lines (m², not assumed),
  only where a roof cuts a wall; the `wall:`, `wall-type:` and `external_finish` lines take the rest.
  Each wall-type run in `grid_takeoff` has `gable` (inside `face`, which is now under the roof), and
  each room's take-off has `gable` (inside `wallFace`). No new code in the record.
