# 2026-11-27: seats, desks and covers counted from the furniture and held to the brief (ARE-67)

## For people

- Grid counts the seats, desks and covers your furniture gives, for the whole plan, each floor,
  each room and each zone, with the rule each piece was read by: a chair is one seat, a sofa one
  per 0.6 m of its width unless its label says, a desk one desk, a seat at a table one cover. The
  brief takes your targets for them, for a room, a zone, the rooms of a use or the whole plan, and
  says each is met or missed with the count beside it. A wish for numbered rooms ("Phone booths",
  six of them) now finds "Phone booth 1" to "Phone booth 6", or the rooms of that room type (ARE-67).

## For agents

- `grid_measure` takes `what=seats` (with `room`, one room or zone): the seats, desks and covers
  counted from the furniture, in `answer.plan`, `answer.floors`, `answer.rooms`, `answer.zones` and
  each piece in `answer.items` (`seats`, `desks`, `covers`, `room`, `zone`, `from`: `kind`, `width`
  or `label`), with its rule.
- `grid_fields`, `grid_find` and `grid_count`: new fields `seats`, `desks` and `covers` on items,
  rooms and floors, and `item zone` on items; `kind` takes `item` for every fixture and piece of
  furniture, which was refused.
- `grid_write_brief`: a `rooms` wish takes `seats`, `desks` and `covers`, each also as
  `_at_least` and `_at_most`; `figures` takes `seats`, `desks` and `covers` (a whole number, the
  whole plan's, at least). Their lines carry `unit` `seats`, `desks` or `covers`. A room wish with
  none of them whose quote says a number of seats, covers or desks is counted against at least
  that many and its text says so. A wish's name also matches a room's `roomType`, and a plural name
  the rooms named in the singular. No new code in the record.
