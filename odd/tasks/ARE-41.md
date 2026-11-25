# ARE-41: taped lengths are set against the building as surveyed

## Outcome

A length taped on site is set against the existing state of the plan, never the proposed one.
`grid check`, `grid_check` and the answer of every change to the plan give the same rows. A
taped length in a room that only the work will make is not measured ("the plan has no room").

## Design

- `packages/floorplan/src/geometry/taped.ts`, `tapedLengths`: reads `planInState(plan, 'before')`
  itself, so no caller has to choose the state. A plan with no phases is read as it is.
- `packages/rules/src/result/inspect.ts`: the check passed the plan after the work; it now passes
  the whole plan, as the change answers (which hold the whole plan) always did.
- Decision: a room that is new has no existing state, so it reuses the "no room" reason rather
  than adding a message code; easy to refine later with its own wording.
- `docs/plan-file.md`: the taped section says the existing state is what is measured.

## Done

- `geometry/__tests__/tapedExisting.test.ts` and `rules/src/result/__tests__/tapedExisting.test.ts`
  (the second fails before the change).
- floorplan, rules and cli test folders, ownWords and tolerances tests, typecheck, lint, scoreboard.
