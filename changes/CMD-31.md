# 2026-11-25: the comparison by phase judges its issues by what the work does (CMD-31)

## For people

- `grid diff --since phase` no longer lists a door as joining other rooms when the work takes its
  room out and builds a new one in its place, as a knock-through does. It now lists an old window
  the work leaves between two rooms, such as one a new room is built against (CMD-31).

## For agents

- `grid_diff` and `grid diff` with `since: "phase"`: a `door_joins_other_rooms` issue is left out
  when every room the door no longer joins is one the work takes out, each taken by a room the
  work builds. A door that comes to join the outside, floor not drawn or a room that stood before
  the work is still one. New comparison issue code `window_between_rooms` (by phase only, after
  the doors): a window in both states that had a room on one side at most before the work and
  stands between two rooms after it; its entities are the window and the two rooms. Comparing
  with a marker or git is unchanged. `compareBuildings` takes `work: true` for this. No new code
  in the record.
