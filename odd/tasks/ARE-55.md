# ARE-55: take off a fit-out as a fit-out

## Outcome

A plan that names a `base` (a fit-out in a shell, C16) is taken off as the work it is: its own
partitions, doors and finishes. The take-off lists no slab, no roof and none of the shell's walls.
A mid-floor office no longer reads with a ground slab, a roof and 147 m of outside wall. A plan
with no `base` is taken off exactly as before.

## Design

- `packages/cli/src/quantities/takeoff.ts`: `planTakeoff` knows a fit-out by `plan.base`. Its wall
  runs leave out every wall read as `existing` (the base's walls, put in by `mergeBase`); walls the
  fit-out states itself (new, or any phase it gives them) are counted. Rooms keep their finishes:
  the skirting, ceiling and wall face of a fitted room still run along the shell's inside faces,
  which are finished by the work.
- `envelopeTakeoff` gives each floor of a fit-out no slab and no roof, with `why` saying the shell's
  slab and roof belong to the base, and `slabs` and `roof` null. Nothing is assumed for them.
- Decision: a fit-out is known only by `base`. A single plan with phases but no base may be a
  refurbishment of a whole building, whose slab and roof are its own; it keeps them.
- No new convention and no new message code.

## Done

- `quantities/__tests__/fitOutTakeoff.test.ts`: a fit-out on a mid-level floor has only its own wall
  runs, no slab and no roof; the same shell as one plan keeps its walls, slab and roof.
- Typecheck of floorplan and cli, lint, the cli quantities tests, `ownWords` and `tolerances` tests.
