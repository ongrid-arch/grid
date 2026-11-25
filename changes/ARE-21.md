# 2026-11-25: a route to outside takes the nearest way out (ARE-21)

## For people

- A route to the outside is now walked to every way out and takes the nearest, where it used to
  take the first it met, which could be a door many metres further. The answer names the way out
  it took and lists the others with their lengths (ARE-21).

## For agents

- `grid_measure what=route to=outside` answers with the way out that is shortest by walked
  length. The answer gains `exit` (the doorway's id) and `otherExits` (the other ways out,
  nearest first: `via`, `type`, `rooms`, `length`, null when not measurable), and the text a line
  "Nearest way out: …". A route between two rooms has neither field. `what=route` with `width`
  starts from the nearest way out too. No new code in the record.
