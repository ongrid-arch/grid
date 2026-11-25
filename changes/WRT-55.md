# 2026-11-25: rooms-text refusals say what is wrong, and placement edge cases come out as written (WRT-55)

## For people

- Rooms text gets what a line says, or a refusal that says what is wrong and how to write it
  (WRT-55). A room placed or sized twice on one line is refused, never read by its last words.
  `until <room>` stops at the near face of the room it names when that room is in the way, and
  `until near <room>` always does. A `*` along the room it is placed beside takes that room's
  extent. `repeat ... w=* fill <length>` works out the width so the row is that long, and a row
  that runs past the corridor it is placed beside is said once. Two rooms sized to their outside
  faces placed one beside the other add up, and rooms of a unit sized to centre lines keep the
  inside wall between them. A repeat label keeps its leading zeros (`001`, `002`). A window in a
  side partly against another room goes in the outside stretch. Doors may carry a name. `open`
  says which room it opened to, takes `open <room>`, and opens a room cut out of a corner to its
  host. A `wall between` line stands a wall between rooms placed touching. Refusals for a gap,
  rooms touching or overlapping, `outdoor` as a use, a floor named on a room line, a door between
  two rooms that `opens in` or `out`, and an unknown word on a wall line give only advice that
  applies, with sizes or lines that write.

## For agents

- `grid_write_rooms` and `grid write`: a room line with two places (`at`, `<side> of`,
  `inside ... corner`) or two sizes is refused with `rooms/syntax` naming both. `until` runs to
  the named room's near face, less the wall between, when that room lies across the stretch, and
  with `until near`; elsewhere to its far face as before. A `*` across the placement with no
  `until` takes the extent of the room it is placed beside, and `guesses` says so.
  `repeat ... <setting>=* fill <length>` works out that setting; a row that cannot come out that
  long is refused with `rooms/fill`, and `fill` without one `*` setting with `rooms/syntax`. A row
  whose first unit is placed across a room, or a fixed-length room placed beside a row, that runs
  past that room's end gives `rooms/row-overrun` once, first in `warnings`, and first in
  `problems` when the text is refused. A repeat label ending in digits counts from them and keeps
  their width (`as 001`: `001`, `002`; `as A01`: `A01`, `A02`).
- Rooms sized `outside` placed one beside another give up half the wall between them, so the two
  sizes add up; a room of a unit sized `centre` or `outside` and placed `at x,y` is placed by the
  corner its size measures to and gets the inside thickness from its neighbour (it got the
  round's gap, 0.3 m).
- An opening line may carry a name after its id; it is written to the opening's
  `properties.name`. `opens in` or `opens out` on a door between two rooms is refused with
  `rooms/door-side` and `fixes` holding the line with `opens into` each room. A between-door's
  `<m> from <side>` that misses the shared wall when measured along the side is measured along
  the shared stretch, with a guess. A window `in <room> <side>` that does not stand in the
  side's outside stretch is moved into it, with a guess.
- `open` takes a room (`open <room>`); a bare `open` is said in `guesses` with the room it
  opened to, refused (`rooms/syntax`) on a room placed `at x,y`, and on `inside <room> corner`
  opens the room to its host. A `wall between` line for two rooms placed touching makes that wall
  on their shared line and warns `rooms/wall-on-line`. `rooms/gap` names the size of each room
  that closes the gap to a wall; `rooms/touching` offers `open` only to a room placed beside the
  other, else `open <room>`; `rooms/overlap` offers a corner only to a room that fits.
  `outdoor` or an outdoor kind as the use is refused with `rooms/unknown-use` and `fixes`; a
  room line's `floor <name>` with `rooms/syntax` pointing to floor lines. A wall line's unknown
  word lists the thickness as a bare number. A quote mark inside quotes may be written `\"`.
  No new code in the record.
