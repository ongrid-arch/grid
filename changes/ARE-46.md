# 2026-11-25: a doorway an item blocks is closed for walks and routes (ARE-46)

## For people

- A door or opening that a fixture or a piece of furniture leaves no clear width in is now treated as
  closed. A kitchen run across a bedroom's only door no longer lets the walk or a route enter the
  room, and the check lists the room as one no route reaches until the item is moved.

## For agents

- `grid_measure what=route` with no way through says which doorway an item closes and which item,
  and carries `answer.blocked` (`via`, `between` rooms, `by` item ids). `grid_describe` walks and
  every route, entrance and way-out reading skip such a doorway. A room whose only door is blocked
  is `room/no-route-to-exit`, not `room/without-door`. No new code in the record.
