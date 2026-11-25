# 2026-11-25: one id rule for rooms text, every tool and every option (CMD-24)

## For people

- Every place an id is typed reads it by one rule: rooms text, every tool, `grid edit` and
  `grid diff --rooms`. An id one of them takes, all take, and `grid diff --rooms baño` reaches the
  room rooms text wrote as `bano` (CMD-24).
- Rooms text that writes an id with letters that have no plain form (`客厅`) is refused with a
  plain id to write instead, made from what the part is (`living` for a living room), and the
  line that keeps the name in quotes: `room living "客厅"`.
- A plan whose file holds such ids, written before ids were plain or by hand, reads back as rooms
  text with plain ids in their place and every name as written (`grid describe --as rooms`), and
  that text writes back over the plan, so the plan gets ids every tool takes without its file
  being changed by hand.

## For agents

- `rooms/bad-id` names a plain id to write (`such as 'living'`) and, for a room or a floor, the
  line that keeps its name (`room living "客厅"`).
- `grid_describe as=rooms` of a plan whose ids have letters with no plain form writes plain ids
  (a room's from its use, `living`, `bedroom-2`; a wall's from its rooms', `w-living-bedroom`),
  says which id became which in a comment line, and stays based on the plan as the file holds it:
  pass it to `grid_write_rooms` as it is and the plan has plain ids.
- A tool refusing an id argument with such letters says to do that.
- `grid_view`'s `camera` and the preview record take the plan's own ids as the plan holds them,
  ids written before ids were plain included.
- Every id argument's schema `pattern` is the one rule's (`ID_PATTERN` in `types/planText.ts`),
  unchanged: `^[A-Za-z0-9._-]{1,64}$`.
- No new code in the record.
