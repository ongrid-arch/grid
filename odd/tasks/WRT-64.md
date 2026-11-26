# WRT-64: a grouped note that changed is one issue in a diff

## Outcome

`grid diff` and `grid_diff` say a grouped note of the drawing check (one line for the same note on
several rooms) that gained or lost a room as one issue, `note_changed`, saying who joined and who
left: "Note room/no-door changed (now also "Meeting 8"; "Office 4" and "Office 5" no longer): …".
Before, the group's line keyed on every room in it, so one room merged or added made the whole
line one new note and one gone note, and the verdict counted two issues to look at though only
one room's note had come or gone. A group whose rooms all stayed is still no issue, and a note on
one part that came or went is still `note_added` or `note_gone`.

## Design

- `packages/floorplan/src/geometry/diff/building.ts`, `noteIssues`: `NoteLike` gains the two
  fields of a result line the pairing needs, both optional, so a caller that has neither is read
  as before: `each` (the parts a grouped line stands for) and `floor`. The CLI already passes
  `inspectPlan`'s lines, which carry both, so `packages/cli/src/versions/diff.ts` is unchanged.
- The exact match stays first. Of the notes left over, a new one and a gone one are paired when
  they have the same code, kind and floor, at least one of them stands for several parts, and
  they share a part (the earlier one's parts followed through renamed ids). A new note takes the
  gone one it shares most parts with. A pair is one `note_changed` issue with the later note's
  wording, the parts that joined and those that left by name (rooms by their names, from the
  later plan and the aligned earlier one), and those parts as its entities.
- A pair is said in Grid's own words (`diff.issue.noteChanged`, `diff.note.group.added`,
  `diff.note.group.gone` in `messages/en.ts`, with draft Spanish in `es.ts`).
- `note_changed` sorts between `note_added` and `note_gone`. It is a comparison code, not a line
  of the result record, so it needs no catalogue entry.
- Decision: a pair stays an issue even when the group only lost rooms, as a gone note is one
  today; what changes is that it is one issue, not two.
- Decision: two single-part notes whose other parts changed are not paired; the change is about
  groups only.

## Done

- `packages/floorplan/src/geometry/__tests__/diff-building.test.ts`: a grouped note that gains
  one room and loses two is one `note_changed` issue naming them, and the verdict counts one
  issue; a group of two shrinking to one room is one issue; a grouped note on another floor is
  not paired; a single note that came and one that went stay `note_added` and `note_gone`.
- Type check of `packages/floorplan` and `packages/cli`, lint, the diff tests in both packages,
  `ownWords.test.ts` and `tolerances.test.ts`.
