# 2026-11-25: a wrong room id is answered with the nearest ids (CMD-21)

## For people

- A room, wall or opening id Grid does not know is now answered with the five ids nearest it,
  not the plan's first thirty rooms. An id with a floor prefix the plan's rooms do not carry
  (`f3-room-310` for `room-310`) finds the room it hides (CMD-21).

## For agents

- The refusal for an unknown room, wall, opening or crop part now reads "Its nearest rooms: ..."
  (or walls, or doors, windows and openings): up to five ids ranked by nearness, a known id that
  holds the one sent first, then "and N more". An unknown floor also names the nearest floor
  when one is near. No new code in the record.
