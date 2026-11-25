# 2026-11-25: a room in both versions says every change it went through (WRT-32)

## For people

- `grid diff` says everything that happened to a room in one line, by its name: a room renamed
  and moved says `"Bedroom 1" renamed "Study"; moved 0.30 m east on the drawing`, not only that
  it was renamed (WRT-32). In a plan written rooms first, a room whose id changed is still the same
  room, even when it moved, and its id change is named. Two rooms knocked into one read as a merge
  with the wall taken out (`"Living room" merged with "Kitchen", wall "living-north" taken out
  between them; 18.48 m² → 32.12 m² ...`), not as a room lost.
- `grid_compare` says a room that kept its name and size but stands somewhere else moved, how far
  and which way (`"Spine" moved 1.00 m east on the drawing, as it was`), and no longer counts it
  among the rooms that keep their name and size; so does the verdict of every change.

## For agents

- `grid_diff`'s `rooms` gain `by` (metres east and north on the drawing, or null), `idBefore` (the
  earlier id when it changed, or null), `mergedWith` (the earlier rooms merged into it),
  `wallsTakenOut` (the walls taken out between them) and `mergedInto` (for a room `removed`, the
  later room it was merged into, or null). `moved` is now set for a `changed` room that kept its
  size and moved too, and its text says `moved ... on the drawing` after its other changes. The
  statuses are unchanged: a room merged into another stays `removed`, with `mergedInto`.
- A room whose id changed says it after its name, `"Bedroom 1" (id "bed1" → "study") ...`; the
  verdict names up to three such rooms after the renamed ids, `the id of "Bedroom 1" is now
  "study" (was "bed1")`. An id change alone is still no change line.
- A merge is one change line, the room that took the other in, with both rooms among its
  `entities`; the room that went is no line of its own and its verdict text is `"Kitchen" merged
  into "Living room", 13.20 m²`. `marks.removed.rooms` still lists it.
- Two plans written rooms first pair a room left unpaired by id and by place with the one room of
  the same name on its floor (`alignPlans`), and a wall under a new id there raises no
  `suspected_id_churn` issue: its walls are named after its rooms.
- `grid_compare`'s comparisons gain `roomsMoved` (`name`, `moved`, `by`, `text`), and each room row
  `moved` and `by`; the text prints the rooms that moved beside the count of those that keep their
  name and size. The edit's verdict (`grid_change_*`, `grid edit`) names them too.
- No new code in the record.
