# CNT-35: a demolished and a new opening in the same place are not an overlap

## Outcome

A widened door, written as an old opening to be demolished and a new one in its place, gets no
openings-overlap note anywhere. The drawing check already reads each state on its own
(`validatePhases`); the writing check for rooms text (`rooms/openings-overlap`) did not, so a
phased plan whose openings reach the rooms-text writer (the raw lines of a read-back, or any text
that states a phase on an opening) was refused for the 0.85 m the two doors share.

## Design

- `packages/floorplan/src/rooms/compile.ts`, `checkOpeningClash`: when any wall or opening states
  a phase, the clash rule runs once in each state (before the work, after it) on the openings
  standing in it, read with `phaseReading` from `geometry/phases.ts` (not changed). Two openings that
  never stand together (a demolished one and a new one) cannot clash. A clash found in both
  states is said once. A plan with no phase is checked exactly as before.
- Decision: this reads phases the way the drawing check does, so an unmarked opening beside a
  demolished one still clashes in the state before the work: it stands there.

## Done

- `rooms/__tests__/phasedOpenings.test.ts`: old and new door in one place compile with no
  `rooms/openings-overlap`; the same two doors with no phase, or old and unmarked, still do; an
  overlap between two new doors is said once.
- `packages/floorplan` tests, `ownWords.test.ts`, `tolerances.test.ts`, typecheck, lint, scoreboard.
