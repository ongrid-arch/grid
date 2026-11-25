# ARE-54: name the phase rule when rooms go unmeasured

## Outcome
When a plan with phases leaves a room out of the areas because the room stands in a state one
of its walls does not (an existing room round a wall to be demolished), the area answer says
so: it names those rooms, the wall and its phase, and gives the pattern that fixes it (both
rooms demolished, the merged room new). Today it says only "could not be measured" and sends
the reader to `grid_check`, and an agent told the person Grid had dropped rooms silently.

## Design
- `surveyPlan` (`packages/cli/src/quantities/survey.ts`) keeps `phaseClashes(stated)`, worked
  out from the plan as stated, because the survey's own plan is already the state after the work.
- `planAreas` (`quantities/areas.ts`) adds one note after the "could not be measured" note for
  every left-out room that has a room clash. The sentence is Grid's own words in
  `messages/en.ts` and `es.ts` (`areas.phase.leftOut`), not a literal in the CLI.
- Rooms left out for another reason keep their note unchanged. A plan with no phases is unchanged.

## Done
- A test in `packages/cli/src/quantities/__tests__/phaseLeftOut.test.ts`: a plan where one wall
  between two existing rooms is demolished names both rooms, the wall, and the pattern; a plan
  with rooms fixed as the pattern says has no such note; a plan with no phases has none.
- Type check of floorplan and cli, lint, the touched tests, `ownWords.test.ts`, `tolerances.test.ts`.
