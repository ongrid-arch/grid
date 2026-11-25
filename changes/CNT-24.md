# 2026-11-25: grid_count groups a figure as it is printed (CNT-24)

## For people

- Counting parts by a size now puts equal sizes in one group: rooms of 13.4996 m² and 13.5004 m²
  are one "13.50 m²" group, not several lines that read the same (CNT-24).

## For agents

- `grid_count` with `by` set to a number groups it at its printed precision: areas to 0.01 m²,
  lengths to the millimetre, other numbers as before. A group's `value` is that rounded figure;
  `sums` still add the true values. No new code in the record.
