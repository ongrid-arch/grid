# ARE-22: a lift shaft's floor is counted once, as a stair's is

## Outcome

A lift shaft drawn as a room on floor after floor, one over the other, is one shaft. Its floor is
counted once in net area, on the floor it rises from. On a tower with a lift room on every floor,
the net area, the net to gross figure and the efficiency no longer hold the shaft once per floor.
The lift rooms over the lowest keep their own area in the room list, marked with the room they are
counted with (`countedWith`), and a note says so, calling the shaft a lift. The gross areas still
hold them.

## Design

- `packages/floorplan/src/geometry/areas.ts`: `stairStacks` takes the rooms used as a lift as well
  as those used as a stair. `floorJoins` already joins lift rooms on neighbouring floors by the same
  overlap (`kind: 'lift'`), so the stacking reads those joins too. A stair room and a lift room never
  join each other, so one map holds both. The note is worded by the use of the lowest room.
- Decision: no new use called "core". The brief offered two ways (count once, or name as core and
  keep out of net). Counting once is the way a stair is already treated, needs no new use in the
  fixed list of uses, and keeps the gross figures as they are.
- `docs/areas.md`: the paragraph on the stair says a lift shaft is counted once the same way.
- Not changed: the CLI's wording "with the stair below" (outside this area).

## Done

- `areas.test.ts`: a lift shaft over three floors counts once (net, `byUse`, `overStairs`,
  `countedWith`, note), fails before the change; a lift room that does not line up is still counted
  on every floor.
- `npx vitest run packages/floorplan/src/geometry`, typecheck, lint, the scoreboard.
