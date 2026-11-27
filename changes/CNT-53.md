# 2026-11-27: opening phases in schedules (CNT-53)

## For people

- The opening, door and window schedules show each opening's phase and list removals in a
  **To be removed** section in both text and CSV (CNT-53).

## For agents

- `grid_schedule` with `of=openings`, `of=doors` or `of=windows` gives each row a `phase`
  of `existing`, `new` or `demolished`. A type key can appear once per phase. Demolished
  rows follow the others and describe the openings before the work. Top-level `count` and
  `counts` still count the openings that stand after the work. CSV adds `phase` and
  `section` columns. No new code in the record.
