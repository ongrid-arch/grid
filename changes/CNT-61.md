# 2026-11-27: many items in one call, and rooms furnished in one call (CNT-61)

## For people

- Furnishing a house is one request: every bedroom, bathroom, toilet, kitchen, living room and
  dining room gets its usual set of furniture or fixtures, each placed where Grid's checks find it
  clear of the walls, the doors and the other items, and Grid says which rooms it could not
  furnish and why. Two new typical rooms, a living room and a dining room. Several items can also
  be placed at their points in one change (CNT-61).

## For agents

- New tool `grid_furnish_rooms` (`rooms`, `sets`, `out`): each room named, or every room whose use
  has a usual set and that holds no item yet, takes a typical room's set (bedroom
  `double-bedroom` then `single-bedroom`, bathroom `bathroom` then `shower-room`, toilet
  `cloakroom`, kitchen `kitchen`, living `living-room`, dining `dining-room`; `sets` names
  another). A set is placed as it is drawn against a side of the room where the fit checks name
  none of its items; a set of fixtures that fits nowhere so is set out item by item as
  `grid_add_item` does with a typical room. Its data: `placed`, `fits`, `notFurnished` and
  `rooms` (each `room`, `set`, `how`: `as-drawn`, `item-by-item` or `not-furnished`, and
  `placed`). The tool server lists one more tool.
- `grid_place_item` takes `items`, a list of entries with the fields one call takes (`name`, `x`
  and `y` needed in each), up to 200, placed in order as one change; `name`, `x` and `y` are
  needed only without it. One entry refused refuses the list, its refusal starting
  "Entry <n> of items:", and nothing is written. `grid edit place --items` takes the list as JSON.
- New typical rooms `living-room` and `dining-room` in Grid's library (`grid_measure
  what=library`).
- `docs/tool-server.md` says that calls sent together are applied one at a time, each on the plan
  the one before left.
- No new code in the record.
