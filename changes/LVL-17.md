# 2026-11-25: a door onto a floor much higher than its own is not a way through (LVL-17)

## For people

- A door or an opening between two rooms whose floors stand more than a step apart (more than
  0.3 m, Grid's own size, not a code figure) is no longer counted as a way through. A foyer door
  that opens onto a hall's back row 3 m up is named, with both rooms and both floor levels, and
  the back row is said to have no route out until a stair joins the two (LVL-17). A door into or
  out of a room used as a stair is still a way through.

## For agents

- New finding `opening/between-levels` (rule `door-leads-somewhere`): a door or doorless opening
  between two rooms of one storey whose `floorOffset`s differ by more than `passableRise` (0.3 m),
  neither room used as a `stair`. The thing is the opening; `also` holds both rooms, the lower
  first. The report's finding carries `levels` (`lower` and `upper`, each `room` and `at` in m from
  the storey's floor, and `rise`). The opening is not a way through: the way-out check and
  `grid_measure` no longer route through it, so a room whose only door it is gets
  `room/no-route-out`, never `room/no-door`.
- New limit `passableRise` in the tolerances table.

## Codes

| `opening/between-levels` | {wording} | floors no more than {step} m apart, Grid's own size for a step and not a code figure, or a stair between them |
