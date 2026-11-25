# WRT-23: door and window marks and room numbers stay put across edits

## Outcome

- A door or window keeps its mark. After an edit the schedule still labels window `W3` as `W3`,
  not `W2` because an earlier window was taken out.
- A mark can be stated: an opening's fact `mark` (in its `properties`, C9) is the mark the
  schedule shows. An opening whose id already is a mark of its own type (`D2`, `W3`, `O1`) is
  shown by that id. Every other opening is counted as before, skipping the marks already taken.
- Adding, splitting, merging or removing a room does not renumber the other rooms: when the
  change would move a room's shown number, the edit writes the numbers the rooms had as their
  stated `number`, and the new room takes the next free one. So the IFC space names, which are
  the room numbers, stay as the consultant's model had them.

## Design

- `packages/cli/src/quantities/schedule.ts` (`openingSchedule`): two passes. First each opening's
  claimed mark (stated fact, else an id of the form letter+digits whose letter is its type's);
  a mark claimed twice goes to the first, the rest are counted. Then the counted ones take the
  next number of their letter that no claimed mark holds. No schema field: a stated mark is a
  fact, and Grid checks nothing against a fact.
- `packages/cli/src/edit/numbers.ts` (`keepRoomNumbers`): reads the numbering (`roomNumbers`)
  before and after the patch; only when a room that was there shows a different number does it
  pin, so a plan whose numbers did not move is written as before. Called where the change is
  written (`mcp/writeTools.ts`), the one place both the tool and `grid edit` write through.
- Decision: pinning writes `number` on every numbered room of the plan. That is the same field a
  person writes by hand, and the only way to keep a count stable without a second numbering.

## Done

- `quantities/__tests__/openingMarks.test.ts`: stated mark, id mark, removed window, collisions.
- `edit/__tests__/roomNumbers.test.ts`: adding a room keeps every other room's number and the
  IFC space names; a change that moves nothing writes no `number`.
- ownWords, typecheck, lint, the cli and floorplan folders, scoreboard.
