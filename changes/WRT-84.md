# 2026-11-27: a split does not copy counted facts, a merge adds them up (WRT-84)

## For people

- Splitting a room no longer copies the facts that count something, such as seats or a head
  count, to the new room: the room keeps them, so a 30-seat office split in two still adds up to
  30 seats. Facts that describe the place, such as a department or a cost centre, are still
  copied. Merging two rooms adds up the numbers both carry, and says so (WRT-84).

## For agents

- `grid_split_room` (and `grid tidy`'s split along a wall across a room) gives the new room only
  the facts whose value is text or yes-or-no; a number fact stays on the room alone, and the
  answer's guessed lines name each (`"seats" (30)`) with the `grid_set_facts` calls that give
  each part its own figure.
- `grid_merge_rooms` sums a number fact both rooms carry, with zones or without (the zones keep
  their own), and says `"seats" 10 (4 + 6)`; such a fact is no longer listed as what the second
  room said otherwise. A number only one room carried is kept and named in a guessed line, and a
  merge given a use other than the first room's names the first room's other facts it keeps.
  No new code in the record.
