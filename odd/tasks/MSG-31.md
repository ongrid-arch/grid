# MSG-31: a free-standing item is said by where it stands in the room

## Outcome

- The walk never says an item that stands metres into a room is "in the wall you stand in".
  An item against a wall that faces back toward you, but whose near side is well ahead of
  you, is said as standing in the room: how far ahead and how far to one side.
- Items against a wall you really face, or the wall you stand in, are said as before.

## Design

- `packages/cli/src/describe/walk.ts`, `thingsIn`: a fixture or furniture item within
  `AGAINST_WALL` of an outline edge goes on the wall that edge faces. An inner wall (a step or
  notch in the outline) can face behind you while standing far ahead. When the group would be
  `behind` and the item's near side is more than `STRAIGHT` ahead of you, it goes to the
  "standing clear of the walls" group, with its near side measured as for any item there.
  Same for `ahead` with the item behind you. Reuses the walk's own `STRAIGHT` figure; no new
  tolerance, no new words.
- Test: `packages/cli/src/describe/__tests__/walkInRoom.test.ts`, an L-shaped room with a
  table against its notch wall.

## Done

- The new test fails before the change and passes after it.
- `walk*.test.ts`, `ownWords.test.ts` and `tolerances.test.ts` pass; lint and the package
  type check are clean.
