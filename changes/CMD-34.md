# 2026-11-26: rooms named by their names in the comparison's issues (CMD-34)

## For people

- `grid diff` names rooms in its issues by the names you gave them, as its verdict and changes
  already did: a door that now joins other rooms reads `joined "Bedroom 1" and "Hall"`, no
  longer `joined "bed1" and "hall"`, and so do a room that no longer closes and a room that may
  only have changed its id (CMD-34).

## For agents

- `grid_diff` and `grid diff --json`: the `message` of a `door_joins_other_rooms`,
  `room_unclosed` or room `suspected_id_churn` issue names each room by its name (its id when it
  has none), so it can be passed on as it is. The ids are in `entities`: a
  `door_joins_other_rooms` issue now lists the door and then every room on either side of it,
  after the change and then before it, by the ids of the version each stands in. A room id
  change whose two rooms share a name reads `Room "Bedroom" was removed and added again in the
  same place under another id`. No new code in the record.
