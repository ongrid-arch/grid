# 2026-11-26: fixtures set end to end read as one run (CNT-37)

## For people

- A line of fixtures standing against each other, such as a cooking line, is now read as one run:
  only the two ends of the run are held to clear floor at their sides, and a kitchen run or a
  shower is never asked for side clearance. Where two runs face each other, the floor between
  them is said as an aisle (CNT-37).

## For agents

- `grid_measure what=use`, `use/space-by-fixture`: a side flush against another fixture is
  `joined` (named in `detail.joined`, `left` or `right` null) instead of measured at zero; the
  least figure leaves joined sides out. A kind with no side clearance (kitchen run, shower) has
  `left` and `right` null and says no sides. `detail.frontBy` names the fixture that stops the
  front, said in the line as "an aisle to …". No new code in the record.
