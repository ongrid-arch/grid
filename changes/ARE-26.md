# 2026-11-25: measures name the fixtures they leave out (ARE-26)

## For people

- A room's turning circle, free floor and the other measures that depend on fixtures now say which
  fixtures they left out and why. A toilet with no height used to leave its room reading as holding
  no fixtures, with a clear turning circle; the answer now names the toilet and its missing height
  (ARE-26).

## For agents

- `grid_measure` (`what=use`, `what=fit`, `what=access`, and `what=route` with a width) and
  `grid_areas` add one line, "Left out of this measure, so the floor they stand on is not taken
  off: …", and `fixturesLeftOut` in their data (`id`, `field`, `found`: the field that kept the item
  out and what was found there, null when grid_check holds the reason), when a fixture is left out.
  `what=use` no longer says "the room holds no fixtures" then; it says none could be measured. A
  plan with nothing left out answers as before. No new code in the record.
