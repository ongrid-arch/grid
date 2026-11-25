# 2026-11-25: dividing lines and walls on angled shared sides (CNT-36)

## For people

- In rooms text, a `wall between <a> and <b> virtual` line now gives a dividing line on a side
  the two rooms share at an angle, as it does on a square side: a chapel, a bay or a wing written
  as a polygon against the angled side of another room, its corners to the centimetre, is opened
  to it, with no outside wall across its mouth and no drawing problems of Grid's own making. Two
  rooms opened to each other that share no side are refused, naming both (CNT-36).

## For agents

- `grid_write_rooms` and `grid write`: two room faces that run the opposite way face each other
  when their distance apart changes by no more than 0.02 m along the shorter (`roomsFaceSkew`),
  so rooms written to the centimetre on an angled side share it: a dividing line, an inside wall
  or the gap's refusals apply there as on a square side, where before each room got its own
  outside wall across it. Rooms opened to each other (`open` or a `virtual` wall line) that share
  no side are refused with `rooms/no-shared-wall`, the code a door between such rooms has, with
  both rooms and the rooms each shares a side with; before, the line was ignored. The check reads
  two walls of one side of a room whose directions differ by a sine below 0.001
  (`writtenParallel`) as parallel, so an angled side written to a tenth of a millimetre is traced
  as a square one is. No new code in the record.
