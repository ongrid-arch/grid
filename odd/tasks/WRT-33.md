# WRT-33: say when a merged room's type no longer fits, and offer to remove its doubled door

## Outcome

Knocking two rooms into one no longer leaves a stale type or a doubled door unsaid. When the merged
room carries a type fact of the person's own (a fact whose name ends in "type", such as
`type: 1.5x3` on a storage unit), the answer says the type is still the first room's and the
room is now another size, and says what to pass to change it. `grid_merge_rooms` takes `type`,
which sets that fact. When the merged room has two doors on one wall (two units whose doors both
open onto a corridor), the answer names them and offers `grid_change_opening` with `remove: true`
for one. Nothing is removed or changed in silence.

## Design

- `packages/cli/src/edit/merge.ts`: `MergeRequest.type`; a type fact is read with `typeFactOf`
  (the first fact of the room whose name ends in "type", in any capitals, and the key it is
  written under). The merged room's `properties` get the new value; with none stated, a `guessed`
  line says the merged room keeps the first room's type (or the second's, taken as any fact it did
  not carry) and its new area. The doubled doors are found after the openings are seated: doors
  (not windows or doorless openings) that are on one wall piece of the merged room, in the plan as
  it will be, are named in `said`, with the call that takes one out. A merge with zones says it
  too, since the zones keep their own types and the merged room carries the first's.
- `packages/cli/src/mcp/editTools.ts`: the `type` argument and the description.
- Words are in the answer's own sentences (the English count in `ownWords.test.ts` moves with them).
- Decision: a "type" is a fact, as Grid has no room type field; no new convention is needed.

## Done

- `packages/cli/src/edit/__tests__/mergeType.test.ts`: fails before, passes after: the stale type
  is said, `type` sets it, no type fact says nothing, two doors on one wall are offered, one door
  is not, a window is not.
- typecheck, lint, the cli and rules tests, ownWords, scoreboard.
