# CMD-23: name the roof the plan states in tool texts and answers

## Outcome

An agent that reads `grid_view`'s description or any of its 3d and facade answers learns which
roof the plan states (a hip, a gable, a mono-pitch roof, with its pitch or ridge) and that a flat
roof is only what Grid takes where the plan states none. No text says every roof is flat, so an
agent no longer refuses to draw a pitched roof the plan already holds.

## Design

- `packages/cli/src/mcp/readTools.ts`: one helper, `statedRoofWords`, words each stated roof as
  "a gable roof, pitched 30°, over "Ground floor"" (pitch or ridge, ridge direction, high side).
  The 3d answer uses it both when the roof is drawn and when it is hidden (then it still names the
  stated roof and says roof=show draws it). The facade answer gets a roof sentence the same way,
  and says so when the floors state none. The description of `grid_view` says the model and the
  facade draw the stated roof (flat, mono-pitch, gable or hip), and flat only where none is stated.
- Decision: no new message code and no new convention; these are tool texts, not catalogue words.

## Done

- `cameraView.test.ts` and `checkView`-style tests: a hip and a gable plan name their roof and
  pitch in the 3d answer, hidden or drawn; the facade answer names it; a plan with no roof says
  flat is taken; the description holds no sentence saying every roof is flat.
- `tools.test.ts`, `ownWords.test.ts`, typecheck, lint and the cli test folder pass.
