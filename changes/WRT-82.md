# 2026-11-27: curved walls by their ends and a point, a radius or a bulge; the sweep in the fix (WRT-82)

## For people

- A curved wall written raw in rooms text may be given by its two ends and a point on the curve,
  its ends and a radius with the side it bows to, or a bulge as CAD drawings store it; Grid works
  out its centre and sweep and says them. `from` and `to` are read as `start` and `end` (WRT-82).
- When a curved wall's end lies on its circle but its sweep goes the wrong way round (or is given
  in radians), the check names the sweep that reaches the end, ready to copy (WRT-82).
- `grid write` and `grid_write_rooms` list the drawing's new problems by code and part, after
  their count (WRT-82).

## For agents

- `raw wall` takes `"arc": {"through": [x, y]}`, `{"radius": <m>, "side": "left"|"right"}` (the
  shorter arc) or `{"bulge": <b>}` (tan of a quarter of the sweep, counter-clockwise positive; also
  on the wall itself; 0 is straight), and `from`/`to` for `start`/`end`, on the wall or in its
  `arc`. The plan file holds `centre` and `sweep` as before; the answer's guesses say them
  ("raw wall 'bay' curves round 13,0 turning +180 degrees ..."). Words that name no curve, or two
  forms at once, are `rooms/raw` with the line. A top-level `bulge` is no longer refused.
- `wall/arc-ends-apart`, when the end is on the circle, is said by `issue.wall/arc-ends-apart.reach`
  and names the sweep that reaches the end to four decimals, signed ("The sweep that reaches its
  end is +102.68 (degrees, counter-clockwise positive)"). Off the circle it reads as before.
- `grid_write_rooms` adds the line `New in the drawing: <code> on "<id>": <sentence>. ...` (at
  most five, then how many more) after "To look at", and `drawingProblems.new`, a list of
  `{code, id, message}`, to its data. No new code in the record.
