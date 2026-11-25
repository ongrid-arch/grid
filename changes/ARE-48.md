# 2026-11-25: a wish to keep two rooms apart reads the ways between them (ARE-48)

## For people

- A brief wish that two rooms not touch now reads the doors and open gaps between them, not only
  a shared wall: two waiting rooms that both open into a reception by doorless gaps are missed,
  "joined through "Reception" by two open gaps" (ARE-48).

## For agents

- `grid_write_brief` and every change's brief lines: a `touch` wish at level `avoid` is missed
  when a door or open gap joins the two rooms straight, or a way through other rooms on their
  floor has open gaps only; the text names the rooms between and counts the gaps, and `parts`
  adds those rooms and openings. With a door on every way it stays met, "drawn apart, a door on
  every way between them". `must` and `should` wishes read a shared wall as before. No new code
  in the record.
