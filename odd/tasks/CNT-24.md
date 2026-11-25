# CNT-24: count by a figure at its printed precision

## Outcome

`grid_count` with `by` set to a measure (an area, a length, a width) puts parts of equal printed
size in one group. Rooms of 13.4996 m² and 13.5004 m² are one group "13.50 m²", not two lines
that read the same. A group's value is the figure as it is printed: areas to the hundredth of a
square metre, lengths to the millimetre. Sums still add the true values, so a total is not
changed by the grouping.

## Design

- `packages/cli/src/quantities/query.ts`, `groupParts`: a number is rounded to its field's
  printed precision before it is used as the group's key and value. `m²` fields use two decimals
  (the precision `valueText` in `readTools.ts` prints them to, and the tolerance table's
  `areaReported`, 0.01 m²); `m` fields use three (the millimetre, as printed). A number with no
  unit (a level, a head count, a person's own figure) keeps the four decimals `shown` already
  gives, so nothing changes for it.
- The precision is one constant table next to `groupParts`, derived from the tolerance table
  (`tolerance('areaReported')` for areas); no new literal tolerance is added to the geometry.
- Rounding is half away from zero on the decimal digits, matching what is printed, so a value
  that prints as 13.50 is always in the 13.50 group.
- Decision: the group `value` in the data is the rounded figure, not the first part's raw one,
  so the answer is the same whichever part comes first.

## Done

- `packages/cli/src/quantities/__tests__/groupParts.test.ts`: areas that differ below the
  printed precision give one group; areas that differ by a printed hundredth stay apart; lengths
  group to the millimetre; sums stay unrounded; an unitless number is unchanged.
- `changes/CNT-24.md` fragment.
- typecheck, lint, `packages/cli` tests and the scoreboard do not get worse.
