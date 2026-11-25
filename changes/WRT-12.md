# 2026-11-25: openings in a comparison said where they went (WRT-12)

## For people

- `grid diff` no longer says a door or window stayed where it was when it moved with its wall:
  after a side of a room is moved or the plan is stretched, each opening on the wall that moved
  is said to have moved with it, how far and which way on the drawing, and "stayed where it
  was" is kept for the openings that did not move though their wall moved or was replaced. A
  door or window whose wall moved and whose id changed is paired with itself by its place along
  the wall, not read as one removed and one added (WRT-12).
- The comparison picture draws a wall that moved and an opening that changed in amber at its
  new place, with its old place outlined, instead of drawing it as added over removed (WRT-12).

## For agents

- `grid_diff` answers `movedWith`: the openings with no change of their own that moved with
  their wall or with a room that moved as it was, each with `opening`, `with` (`wall` or
  `room`), `by` (east and north on the drawing, in metres) and `text` (`Window "win-bath" moved
  with its wall, 0.50 m east on the drawing, in "Bathroom"`). They are listed in the text under
  "Openings that moved with their wall or room", and the verdict counts them (`2 openings moved
  with their walls`). They are not change lines.
- `stayed` holds only openings that did not move in the building while their wall moved or was
  replaced; the text's heading for them is now "Openings that stayed where they were".
- Openings are paired by their place along a paired wall that moved, after the pairing by place
  in the building and before the pairing by id.
- The picture's sentence reads "what changed in amber (a wall or opening at its new place with
  its old place outlined, a room with its old and new area)": green is only what is new.
- No new code in the record.
