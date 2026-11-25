# CMD-32: grid diff's floor is strict and narrows the answer

## Outcome

- `grid diff --floor <id>` refuses a floor the plan does not have, by name, with the floors it
  has, and exits with the usage code. It no longer draws the ground floor instead.
- `--floor` no longer needs `--picture`. With it, the change lines, the openings that moved with
  their wall or stayed, and the rooms listed are those on that floor; the text says how many
  change lines it left out. The picture, when asked for, draws that floor, as before.
- The tool `grid_diff` does the same with `floor`: it already refused an unknown floor; now the
  floor narrows its text and data too, and the data says which floor (`floor`) and how many
  change lines were left out (`otherFloors`).
- The issues, the verdict and the scope check stay whole: an issue on another floor is still an
  issue to look at first.

## Design

- `packages/cli/src/versions/diff.ts`: `diffOnFloor(run, floor)` reads the floor of every part a
  line is about, in the later plan and in the earlier one laid on it (`comparison.aligned`, where
  the removed parts are): a wall's floors (`wallFloorIds`, so a wall rising through a floor is on
  it), an opening's wall's, a room's, a floor itself. A line is on the floor when any of its
  parts is, in either version, so a room moved between floors is on both. A line about no floor
  (the site, the plot) is left out. `diffText` and `diffData` take the floor and use the narrowed
  lists.
- `packages/cli/src/command/diff.ts`: drop the rule that `--floor` goes with `--picture`; check
  the floor with the command's own `floorOption` (the later plan's floors) after the plans are
  read and before anything is drawn, and narrow by it.
- `packages/cli/src/mcp/diffTools.ts`: pass the floor the tool already checks (`floorArg`) on to
  the text and data; add `floor` and `otherFloors` to the output schema.
- Decisions: a floor is checked against the later plan only, as the picture draws the later
  plan and the tool already does so; issues, verdict and scope are not narrowed.

## Done

- Tests in `packages/cli/src/versions/__tests__/diff.test.ts`: an unknown floor is refused with
  the floors named and a non-zero exit, from the command and the tool; on a two-floor house, a
  change on each floor, `--floor first` lists only the first floor's line and says one was left
  out, with or without `--picture`, and the JSON and the tool's data agree.
- Type check of `packages/cli`, lint, the `versions` and `mcp` tests, `ownWords.test.ts` and
  `tolerances.test.ts`.
