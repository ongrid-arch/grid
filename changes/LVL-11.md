# 2026-11-25: a split level is said once, and each floor is set against what lies under it (LVL-11)

## For people

- `grid check` sets each floor against the floors that lie under it, in its own building, by how
  high they stand, not against every floor one level lower in the plan. A row of houses stepping
  down a street no longer gets notes that set one house's floor against its neighbour's. A floor
  that stands a half level up beside another floor of its building, with nothing under it, is a
  split level: the plan's split levels are said once, with how far up each half level stands and
  on which side of the floor it steps from, and never as a floor that reaches past or sits back
  from the floor below. A floor drawn a storey or more up with nothing under it is still said to
  be out of line (LVL-11).

## For agents

- New code `floor/split-level` (`worth-a-look`, on the floor): one line for the whole plan, on its
  first half level, naming each floor that stands a half level up beside a lower floor of its
  building with no floor under it, how far up and on which side (north, east, south or west) of
  the floor it steps from (the first three, the rest counted). A half level marked
  `overhang: "meant"` is left out of it, and no line is given when every one is. Such a floor gets
  no `floor/out-of-line` or `floor/set-back`.
- `floor/out-of-line` and `floor/set-back` now set a floor against the floors of its own building
  (each building in `buildings`, and the floors none names together) that stand below it, by their
  floor levels when a floor states its `elevation` (else by `level`), and that lie under its
  outline by more than a wall they share; a floor covered by a nearer one is left out. The line
  names those floors. A floor with nothing under it that is no half level is set against the
  floors of its building at the nearest level below it, as before.

## Codes

| `floor/split-level` | {thing} is a half level up beside the floor it steps from: a split level | each half level at the elevation meant, beside the floor it steps from, or marked overhang "meant" |
