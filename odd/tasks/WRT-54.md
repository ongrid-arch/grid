# WRT-54: change an opening's type and handing in one call

## Outcome

`grid_change_opening` can turn a doorless opening into a door and give it its handing in one call.
Its refusals say "an opening", not "a opening".

## Design

- `packages/cli/src/edit/edits.ts` (`changeOpening`): the opening the handing is worked out for
  (`placed`) now carries the type the call asks for, so a change of type is applied before the
  handing and swing, as the swing already was.
- The refusals that name a type choose "a" or "an" by the type (`edits.ts`, and `handingFromRooms`
  in `packages/floorplan/src/geometry/handing.ts`).
- Decision: a handing on an opening that stays doorless is still refused; only the type change
  makes it a door.

## Done

- `packages/cli/src/edit/__tests__/openingToDoor.test.ts` fails before the change and passes after.
- Type check, lint, the cli and floorplan test folders, ownWords, tolerances and the scoreboard.
