# ARE-58: count each reason a part was left unlooked at

## Outcome

A check's line in the short report says how many parts it left out for each reason, not one
total beside every reason. With one window that could not be drawn and 22 openings on a plan that
states no ground level, the line reads "not looked at 23, by reason: 1, could not be drawn; 22,
the plan states no ground level for the site", so the one drawn-wrong window is not read as 23.
A check with one reason reads as it did.

## Design

- `packages/cli/src/command/check.ts` (`coverageSummary`): the gaps are grouped by the reason as
  worded (across floors), each group counts its parts. One reason keeps the old line (`report.gap`);
  several use `report.gap.byReason` with one `report.gap.reason` per group, in the order the
  reasons first appear. The record (`coverage[].skipped`) already counts per reason and is unchanged.
- `packages/floorplan/src/messages/en.ts` and `es.ts`: the two new wordings.
- Decision: the total stays in the line, so a person still sees the whole count first.
- No new convention and no new message code.

## Done

- `packages/cli/src/command/__tests__/coverage.test.ts`: a check with two reasons says each count;
  one reason is worded as before.
- `ownWords.test.ts` and the tolerance test pass.
