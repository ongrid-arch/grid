# SHT-15: drawing sheets at different scales do not replace each other

## Outcome

A drawing sheet's default file name carries its scale and its paper
(`plan-drawing-1-100-A3.pdf`), so an A3 sheet at 1:100 and an A2 sheet at 1:50 of the same floor
are two files side by side, and a second call with the same scale and paper is the only one
that replaces the first. `--out` still writes exactly where it is told.

## Design

- `packages/cli/src/sheet/sheetFile.ts`: `drawingStem` takes the scale and the paper of the
  sheet that was made and ends the stem `-drawing-1-<N>-<paper>` (the colon of `1:100` is not
  a safe file character). The stem is worked out from the made sheet, so a scale or paper Grid
  chose is in the name too.
- Callers read `made.stem`, so the command and the tool server need no change. The answer
  names the written paths already, so it shows the new names.
- `docs/commands.md` gives the new name.
- Decision: the scale and paper are always in the name, even when asked for, so the name never
  depends on what was left out. Old names (`plan-drawing.pdf`) are no longer written; an old
  file is left where it is.

## Done

- Tests: two drawings of one plan at different scale and paper leave two sets of files; the
  same request twice writes the same names; the existing name tests read the new names.
- `npm run typecheck`, `npm run lint`, `packages/cli` tests, `ownWords` and `tolerances` tests,
  the scoreboard.
