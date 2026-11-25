# VEW-55: the person's tags apart from notes, and a key on every floor

## Outcome

- A key annotation is drawn under every floor's picture, not only the ground floor's.
- The key names a sketch category by its own name, as the person wrote it, with no "Sketch:" and
  no "drawn only" for a guest to read.
- `--hide notes` leaves off the notes and their list in the band, and leaves the person's tags
  and symbols (such as a "you are here" tag) on the drawing.

## Design

- `packages/floorplan/src/geometry/floors.ts` (`cutFloor`): a `key` annotation stays on every
  floor's slice. It has no place of its own, so no floor owns it. (One line outside the
  pictures; the slice is where the key was lost.)
- `messages/en.ts` and `es.ts`: `drawing.key.sketch` is `{category}` alone.
- `packages/viewer/src/picture/scene.ts` and `planSvg.ts`: with `show.notes` false only
  annotations of kind `note` are left out; the numbering of tags and the band's list use the
  same filtered list, so marks and list agree.
- `docs/commands.md`: `--hide notes` says what it leaves.
- Decision: a hidden "notes" means text notes only. Tags and symbols are the person's marks on
  the drawing; hiding them stays possible by removing them from the plan.

## Done

- `notes.test.ts`: hide notes leaves tag and symbol and their list entries, drops the note.
- A test: a plan with two floors and a key annotation draws the key on both.
- A test: a sketch category in the key reads as its name only.
- Type check of floorplan and viewer, lint, viewer and floorplan touched tests,
  `ownWords.test.ts`, `tolerances.test.ts`.
