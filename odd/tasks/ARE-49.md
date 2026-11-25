# ARE-49: no brief reminder on a survey

## Outcome

A plan that records what stands, not what a person asked for, is not nagged to keep a brief.
`grid write`, `grid_write_rooms` and `grid write --scan` leave the reminder out (`reminder` is null)
when the plan is a survey, so an agent does not invent wishes from its readings that then fail.

## Design

- `packages/cli/src/brief/answer.ts`: `isSurvey(plan)` is true when the plan keeps taped lengths
  (`taped`), when it has parts and every wall, opening and room is `existing`, or when it has marks
  and every one says `measured` or `scanned`. `briefReminder(project, planFile, plan)` returns null
  for a survey. A brief already beside the plan still gets its lines in every answer.
- The three callers pass the plan they just wrote. The decision is deliberately about the plan's
  own content, so no new schema field (and no new convention) is needed.

## Done

- `brief.test.ts`: a first write of a plan with every part existing, one with taped lengths and a
  scan give no reminder; an ordinary first write still gives it once.
- Typecheck, lint, `packages/cli` tests, ownWords and tolerances tests, scoreboard.
