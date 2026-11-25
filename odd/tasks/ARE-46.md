# ARE-46: a doorway an item blocks is closed for walks and routes

## Outcome

A door or doorless opening that an item (a fixture or a piece of furniture) leaves 0.00 m clear is
not a way through. The walk, every route, the way out and the access measures treat it as closed, so
nothing walks into a room through a door a kitchen run covers. An answer that is about a route or a
wide way names the item that blocks the doorway. A room whose only way in is such a doorway is
listed by the check as a room no route reaches, as a room behind a door too small to pass is.
Moving the item away opens the doorway again.

## Design

- `packages/floorplan/src/geometry/rules/graph.ts`: `floorGraph` reads the storey's own items
  (`plan.items`, already cut to the floor by `planForFloor`) as obstacles (`fixtureObstacles`) and
  works each door's clear width with the same `doorwayClearance` that "clear width of a doorway"
  reports. A door or opening whose clear width is nothing, with an item among those narrowing it, is
  collected as `blocked` (opening, rooms on its sides, the items) and never joins `links`, `exits`,
  `undrawn` or the rest, as a `tooSmall` one does. A door too small to pass, or between levels, keeps
  its own finding first. Every reader of the graph (`wayGraph` for routes, walks, entrances and
  access, and the way-out check) then sees the doorway closed with no edit of its own.
- `packages/floorplan/src/geometry/rules/check.ts`: a room with a blocked doorway counts as having a
  door (it is not "without a door"), so the room is listed by the route check (`room/no-route-to-exit`)
  instead, as a room behind a door too small to pass is not.
- `packages/cli/src/quantities/measure.ts` (`wayGraph`): the graph also answers which doorways are
  blocked and by what (`blocked`), so a route or a walk that fails to reach a room can say why.
  `routeBetween` returns no route through them. `packages/cli/src/quantities/use.ts` (`wideRoute`):
  when a body or route has no way, the doorways the items close are named with their items.
- Decision: "0.00 m clear" is the core's `clear` after the open leaf's allowance, as the placing
  answer already says it, so the doorway the placing answer flagged and the doorway closed here are
  one test. A door that is merely narrowed stays open, as before.

## Done

- A test in the core: a kitchen run across a bedroom's only door leaves `graph.links` without it,
  lists the doorway in `graph.blocked` with the item, and the check says the bedroom has no route.
- A test in the CLI: `routeBetween` from the hall to the bedroom finds no way while the item is
  there and finds it again once the item is gone; `grid_describe` walk does not enter the room; a
  wide-route answer names the item.
- `npx vitest run packages/floorplan packages/cli packages/rules`, typecheck, lint, scoreboard,
  `ownWords` and `tolerances` tests.
