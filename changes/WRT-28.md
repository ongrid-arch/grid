# 2026-11-25: merge and split keep the flats right (WRT-28)

## For people

- Merging two rooms no longer leaves the room that is gone in its flat: the merged room is in the
  flat, and a room split in two puts the new room in the same flat (WRT-28).

## For agents

- `grid_merge_rooms` and `grid_split_room` now update the plan's `flats` and say so in `said`:
  a merged room replaces its rooms in the flat (the first room's flat when they were in two, the
  other flat's change is in `couldNotKeep`; a flat left with no room is taken out), and a split-off
  room joins the flat of the room it came from. No new code in the record.
