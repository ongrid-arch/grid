# 2026-11-25: an opening moved to another wall says so (MSG-28)

## For people

- `grid diff` says a door or window moved from one wall to another, with both walls and what lies
  on each side of each: `Window "win-bed1" moved from wall "ext-south", between "Bedroom 1" and
  outside, to wall "bed1-north", between "Bathroom" and "Bedroom 1"`. It no longer reads as
  "moved 1.65 m along its wall", and a door on another wall is no longer said to hang from the
  other jamb or open to the other side (MSG-28).
- `grid edit opening` moving a door or window to another side of a room says what lies on each
  side of its new wall and of its old one, `It was between "Hall" ↔ "Living"; it is now between
  "Living" ↔ outside.`, instead of its old sides as if they were its new.

## For agents

- `grid_diff`'s change line for an opening moved to another wall reads `moved from wall {from},
  between {sides}, to wall {to}, between {sides}` after its other changes, with no distance along
  its wall and no hinge or swing words, and its `rooms` are the rooms on both walls that are in
  the later plan. An opening whose own wall was replaced keeps its words (stayed where it was,
  moved with its wall).
- `grid_change_opening` with room and side ends with `It was between {before}; it is now between {after}.`,
  read from the plan after the change; before, its "It is between" line read the plan before it.
- The id comparison's summary of an opening on another wall is `moved to another wall`, with no
  distance along it.
- No new code in the record.
