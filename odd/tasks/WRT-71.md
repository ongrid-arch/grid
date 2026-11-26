# WRT-71: the write answer counts raw parts, and says when they are all raw

## Outcome

Writing rooms text made wholly of `raw` lines (the read-back of a plan rooms text cannot give
back, such as one with part types, a void and an outdoor deck on two floors) answers with what was
written: "2 floors, 5 rooms (all written raw); …", with the inside area of the raw rooms. A text
that mixes raw rooms with rooms Grid worked out says how many of the rooms were written raw:
"2 floors, 2 rooms (1 written raw); …". A text with no raw room says what it said before.

An earlier build answered "0 floors, 0 rooms; … 0.00 m² inside in all" for such a text. The
counting of raw parts (WRT-27) already gives the floors, rooms and area; this change holds the
whole case to it, from the command, and makes the first line say the rooms are raw.

## Design

- `packages/floorplan/src/rooms/answer.ts` (`roomsAnswer`): after the room count, the first line
  says `(all written raw)` when every room was written raw, or `(<n> written raw)` when some were.
  The words are Grid's own, in `messages/en.ts` and `es.ts` (`rooms.answer.rawRooms.all`,
  `rooms.answer.rawRooms.some`), so `answer.ts` gains no English sentence.
- Decided: the rest of the first line stays as it is ("0 walls and their kinds worked out; 0
  openings placed"): those count what Grid worked out, and the next line already counts the raw
  walls, rooms and openings kept as written. Saying the rooms are raw on the count is enough to
  read the zeros right.
- Decided: the marker counts rooms only, as the room count it follows does; walls and openings
  have their own line.
- No new message code, and no convention.

## Done

- `packages/floorplan/src/rooms/__tests__/raw.test.ts`: two floors of raw lines only, with types,
  a void and an outdoor deck, answer "2 floors, 5 rooms (all written raw)" with their inside and
  outdoor-or-void areas; the mixed text says "(1 written raw)"; a text with no raw room has no
  marker. Fails before the change, passes after.
- `packages/cli/src/command/__tests__/write.test.ts`: `grid write` of that text into a project
  prints the same first line.
- `docs/rooms-first.md` says what the count line says of raw rooms.
- Checks: the type check of `packages/floorplan` and `packages/cli`, lint, the touched tests,
  `ownWords.test.ts` and `tolerances.test.ts`.
