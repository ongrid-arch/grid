# 2026-11-25: a door on a side with several walls is refused by name, or taken onto the room outside its unit (WRT-51)

## For people

- A door, window or opening written `in <room> <side>` on a room with more than one side facing
  that way (a room with a corner cut out, an L) no longer goes silently into the longest one.
  Grid refuses the line, names each side (`east.1`, `east.2`) with its length and what lies
  beyond it, and gives the line written each way that works. In a unit placed many times, the
  one side onto the corridor or the outside is taken, so a cabin's door reaches the corridor
  instead of its own bathroom. Two rooms that share more than one wall are offered the full
  `in <room> <side>` lines the same way (WRT-51).

## For agents

- `grid_write_rooms` and `grid write`: an opening line `in <room> <side>` where several of the
  room's sides face `<side>` and no `.k` is written is refused with `rooms/no-side` (it was
  placed in the longest side, with a guess only when two were equally long). The message names
  each side by the word that picks it, its length and the rooms or the outside beyond it, and
  the problem's `fixes` hold the line rewritten with each side that then writes. A `.k` that
  names no side is refused the same way. In a unit, when exactly one such side looks onto
  something other than the placement's own rooms, it is used and `guesses` says so with the
  words for the others; no fix is offered for a line written in a unit. `rooms/two-shared-walls`
  now carries `fixes` too: the line with `in <room> <side>` in place of `between <a> and <b>`,
  one per shared wall the opening is then placed in. A `rooms/no-side` refusal for a side no
  side faces lists the sides by those same words. No new code in the record.
