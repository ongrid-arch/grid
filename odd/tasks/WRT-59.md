# WRT-59: one rule for edits on imperfect plans, and answers that lead with what the edit caused

## Outcome
- An edit on a plan the reader leaves parts of out (a part that cannot be read, a value that
  does not fit the format, a fact it cannot hold) is never refused for that alone. The edit goes
  on, the file keeps every part exactly as written (the change is made on the file's own text),
  and the answer says what the reader left out. The one exception is an edit of the whole plan
  (mirror, turn), which would leave the parts it cannot read where they were: it is refused,
  naming them, and nothing is written.
- A side made of several walls in one line (a wall split for heights or kinds) moves as one: every
  wall of the side moves, and the walls that end on it follow.
- An answer opens with the notes the edit caused: the plan's own checks run before and after, and
  what is new comes first, the boundary notes before the rest. Nothing new, no line.
- A rename also renames the brief's wishes that name the room, so they are not read as missed.
- Mirroring or turning a plan of massing (floor outlines, no walls) turns the outlines; a plan
  with nothing to turn is refused.
- A default wall type with no kind is refused, asking for interior or exterior.

## Design
- `command/plan.ts`: a new load option `leftOutKept` lets a whole read go on with faults; the
  faults come back in `faults` as before.
- `mcp/writeTools.ts` `writeChange` reads with it, says the faults ("Left out of the reading, kept
  in the file as written: ..."), refuses a patch with `whole` while any part is left out, and
  leads the text with the new notes (`edit/caused.ts`: the lines of the checks after that were not
  before, boundary first). After the file is written it renames the brief's wishes
  (`brief/rename.ts`).
- `edit/edits.ts`: `moveSide` takes the collinear walls of a side together; `mirrorPlan` and
  `turnPlanBy` take their extent from the floor outlines when there are no walls.
- `edit/types.ts`: a wall type made the default needs a kind.
- Decision: the rule is "go on and say", not "refuse", because the change is made on the file's
  text and loses nothing. `grid_tidy` and the other commands that write a plan back from the
  reading keep refusing.

## Done
- `edit/__tests__/imperfect.test.ts`: the cases above, each failing before the change.
- Type check of `packages/cli`, lint, the edit and mcp tests, `ownWords.test.ts`,
  `tolerances.test.ts`.
