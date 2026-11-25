# 2026-11-25: a way in through a terrace is the entrance (ARE-36)

## For people

- A door that opens onto a terrace, porch or other outdoor space that reaches the street is now
  read as the way in, so the walk through a restaurant or house starts there and the access
  measures take it as the entrance, not a service door straight into the kitchen. A front the
  plan names is honoured the same way (ARE-36).

## For agents

- `grid_describe length=walk` starts each floor at the named front, else a door into an outdoor
  space that reaches outside, else (as before) the widest door into a corridor, else the widest.
  `grid_measure what=access` reads its entrance the same way: the named front when it is a way in
  from outside, else the doors through an outdoor space, else every door out of the ground floor.
- No new code in the record.
