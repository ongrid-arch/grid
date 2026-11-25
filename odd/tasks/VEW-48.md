# VEW-48: a room's notes stack under its label

## Outcome

Two or three notes in one room no longer print their numbered marks on top of each other. Each
mark sits under the room's label in its own row; a note with no room stays at its own place.

## Design

- `packages/viewer/src/picture/writing.ts`, `noteNodes`: a note placed under a room's label
  (`labelAt`) takes the next row in that room. Row `k` is `UNDER_LABEL_PX + k * NOTE_ROW_PX`, where
  `NOTE_ROW_PX` is a mark's diameter plus a small gap. Rows count per room, in the order the
  notes are given, so the numbers keep their order down the page.
- Only marks that are drawn count (`numberedNotes`); a symbol keeps its own place.
- Decision: stack straight down, not sideways. A label's area line is the narrowest thing under it,
  and rows keep each mark's number readable at the smallest scale.

## Done

- `packages/viewer/src/picture/__tests__/notes.test.ts`: three notes in one room give three marks
  with three different places; a note in another room and a note with no room are not moved.
- Viewer test folder, typecheck, lint, `ownWords` and `tolerances` tests pass.
