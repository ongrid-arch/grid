# WRT-32: a paired room says every change it went through, in grid_diff and grid_compare

## Outcome

When Grid compares two versions of a plan, a room that is in both says everything that happened
to it in one line, by its name, with the direction of any move:

- A room renamed and moved as it was (its rooms around it grew) says both:
  `"Bedroom 1" renamed "Study"; moved 0.30 m east on the drawing`, not "renamed" only.
- A room whose id changed in a plan written rooms first is still the same room, even when it
  moved too (today it is read as one room removed and another added). Its line names the id
  change, `"Bedroom 1" (id "bed1" → "study") ...`, and the verdict names a few room id changes by
  name: `the id of "Bedroom 1" is now "study" (was "bed1")`.
- Two rooms knocked into one read as a merge, not as a room lost: the room that took the other in
  says `"Living room" merged with "Kitchen", wall "living-north" taken out between them; 18.48 m² →
  32.12 m² ...`, and the room that went says `"Kitchen" merged into "Living room", 13.20 m²`. The
  merge is one change line, not a room removed and a room grown.
- `grid_compare` no longer says a room that moved "keeps its name and size" in silence: a room of
  the same name and size whose floor stands somewhere else is said to have moved, how far and which
  way (`"Spine" moved 1.00 m east on the drawing, as it was`), in the verdict and its own line.
- The data says it too: each room of `grid_diff` carries `by` (east and north, metres) beside
  `moved`, `idBefore`, `mergedWith`, `mergedInto` and `wallsTakenOut`; each room of
  `grid_compare` carries `moved` and `by`, and the comparison lists `roomsMoved`.

## Design

- `packages/floorplan/src/geometry/diff/building.ts` (`compareBuildings`):
  - The room loop measures the move of every paired room that kept its size, whatever else
    changed, and adds `moved ... on the drawing` to a changed room's words. A room that only moved
    keeps its `moved` status and the grouped line; the openings in a changed room that moved go on
    being said to have moved with it.
  - A room whose earlier id differs (from `alignment.renamed`) has the id change in its line's
    subject. Decision: an id change alone is no change line (the comparison's contract is "ids
    aside, the same building"), but it is named: in the room's own text and, up to three rooms, in
    the verdict's renamed part.
  - A merge: a room of the earlier plan with no pair, whose middle lies on the floor of a later
    room in both versions on the same floor that grew, merged into it. The walls the two shared in
    the earlier plan that the later room no longer lists were taken out between them. The removed
    room's own line folds into the other room's line (one change), and the marks still draw it as
    removed. Decision: no new room status (`removed` stays, with `mergedInto`), so no reader of the
    status breaks.
- `packages/floorplan/src/geometry/diff/place.ts` (`alignPlans`, outside the card's two files,
  kept to one small function): in a plan written rooms first, a room left unpaired by id and by
  place is paired with the one room of the same name on the same floor in the other version. Its
  author named it; walls named after it change with its id, so nothing else pairs it.
- `packages/cli/src/quantities/compare.ts` (`comparePlans`, rooms only): a room that is the one
  of its name in both plans (by floor and id in place), the same size, whose middle stands further
  than `diffPlace` from where it stood (under the comparison's own transform) moved. `RoomDelta`
  gains `moved` and `by`; `Comparison` gains `roomsMoved`, each with its line. The verdict names
  them (up to three by name, more counted with how far).
- `packages/cli/src/mcp/readTools.ts` (one line, outside the area): the "keep their name and size"
  count leaves out the rooms that moved, and their line is printed beside it.
- `packages/cli/src/versions/diff.ts` (one line, outside the area): `grid_diff`'s room data carries
  the new fields.
- Every new sentence is a key in `packages/floorplan/src/messages/en.ts` and `es.ts`
  (`diff.room.*`, `compare.room.*`), so no file gains an English sentence (`ownWords.test.ts`).
  The Spanish is a draft, as the file says.
- No message code, no convention, no schema change.

## Done

- `packages/floorplan/src/geometry/__tests__/diff-room-changes.test.ts` (new), failing before:
  renamed and moved; id changed alone and id changed and moved, rooms first; a merge drawn by hand
  and its data; a room that only moved is still grouped.
- `packages/cli/src/quantities/__tests__/compareRooms.test.ts` (new), failing before: a spine
  moved 1 m east is said to have moved, in the verdict, `rooms` and `roomsMoved`; the same plan
  twice says nothing moved.
- `npx vitest run packages/floorplan packages/cli` (the folders touched), `ownWords.test.ts`,
  `contract.test.ts`, `npm run typecheck`, `npm run lint`, `npm run scoreboard`.
