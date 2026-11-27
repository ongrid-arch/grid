# 2026-11-27: accurate areas and opening details in edit answers (CMD-46)

## For people

- A rooms-text rewrite measures the plan with the columns it keeps. A split checks patterned
  windows before reporting window loss, and an edit that changes one door's swing names the
  door and where it now opens (CMD-46).

## For agents

- The `grid_write_rooms` verdict compares the plan before the write with the full result,
  including parts carried over from the file. `grid_split_room` considers patterned windows
  in `couldNotKeep`. The verdict for a single swing change includes the opening ID and the
  swing detail. No new code in the record.
