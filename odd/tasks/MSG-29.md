# MSG-29: a change names the seen notes it made new again

## Outcome

- When a change to the plan (every `grid_…` edit tool and `grid edit`) brings back a note the
  person had set aside as seen, its answer says so, note by note: the note's number and code, who
  marked it, on which day and why, and which of its parts changed. The data holds the same list as
  `seenNew`; it is empty when no seen note came back.
- `grid_diff` and `grid diff` name the seen notes that held on the earlier version and are new
  again on the plan as it is now, in the same words.
- A note is counted with the same country as the mark: a mark made with `grid check --country US`
  (or `grid_check` and `grid_mark_seen` given a country) is compared against the report counted
  for that country, and its number is its number in that report. A mark made without a country
  is compared against the report counted by the plan's own place, as `grid check` counts it.
- Nothing changes for a plan with no marks file: no line, an empty list, and no extra reading.

## Design

- `packages/cli/src/seen/marks.ts`: a mark keeps the country the check was given when it was made
  (`country`, optional; the file stays version 1 and a mark without it reads as before).
  `madeNewAgain(marks, before, after)` takes each version as its source (plan and text) and its
  lines counted for a country, groups the marks by country, and returns each mark that held on
  the version before and comes back on the version after (`seenStates`, the same comparison
  `grid check` makes), with the note's number in that country's report and its changed parts.
  A note the change took away is not named: it is gone, not new again.
- `packages/cli/src/command/check.ts`: `markNote` records the country when the check's place came
  from the request, so `grid check --seen` and `grid_mark_seen` both keep it.
- `packages/cli/src/edit/seen.ts` (new): reads the marks beside the plan and each version the way
  `grid_check` does (`loadPlan`, the firm's standards, `checkPlan` for the mark's country), and
  words the lines. Reading never fails a change already written: a marks file that can't be read
  gives no comparison, as `grid check` then lists every note as new.
- `packages/cli/src/mcp/writeTools.ts`: `writeChange` reads the marks before writing and names the
  notes after, only when the change replaces the plan itself (marks live beside their plan file,
  so a plan written to another file with `out` carries none). `EDIT_OUTPUT` gains `seenNew`.
- `packages/cli/src/versions/diff.ts` and `mcp/diffTools.ts`: the diff of two versions (a marker
  or the last commit, not the phases) adds the same lines after its issues, and `seenNew` in its data.
- The words are in `packages/floorplan/src/messages/en.ts` and `es.ts` (MSG-11).
- Decision: `grid tidy` and `grid write` over an existing plan are left as they are; they are
  other writers, not edits, and can follow the same helper later.

## Done

- `seen/__tests__/marks.test.ts`: `madeNewAgain` names a mark that held and came back, not one
  that already did not hold, not one whose note is gone, and counts each mark with its own country;
  a mark's country is written and read back.
- `edit/__tests__/seenNew.test.ts`: on the sample flat, a note seen under the US figures comes back
  after `grid_move_room_side`, and the answer and its data name it with its number in the US
  report; with no marks, nothing is said and `seenNew` is empty; `grid_diff` against a start marker
  names it too.
- Type check of `packages/cli`, lint, the touched tests, `ownWords.test.ts`, `tolerances.test.ts`,
  the message languages test and the output schema test.
