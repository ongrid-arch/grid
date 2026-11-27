# Voids in floor areas and take-off

## Outcome

A void adds no net or gross internal floor area. Its take-off gives the length
of the open edge for a guard and gives zero floor, ceiling and skirting.

## Design

Build on the existing void flag, slab opening and guard measurement. In
`geometry/areas.ts`, use the clear opening before column deductions for the
gross figures, and leave voids out of the rooms measured to party walls. In
`quantities/takeoff.ts`, omit ceiling heights and lowered ceiling pieces for
a void. In `grid_takeoff`, include guard lengths in the CSV and declare the
existing guard fields in the output schema. Keep the existing write summary treatment of voids and outdoor space.

## Done

Regressions cover a column through an upper-floor void, a void queried on its
own, and a void with a stated lowered ceiling and an open side. The existing
write-summary tests cover a cabin with a loft void and an open deck. Build,
type check, lint, the floorplan and CLI suites, and the scoreboard pass.
