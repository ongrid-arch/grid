# SHT-13: the "not shown" note is built from what is drawn

## Outcome

The note under a drawing, and under each floor page of the client sheet, lists only what that
floor really leaves out. A floor with beds, sofas or other furniture drawn no longer says
furniture is not shown; a floor with columns or a structural grid drawn no longer says structure
is not shown; a plan that states stairs still does not say stairs are not shown. Services and
landscape are never drawn, so they are always listed. In English and in Spanish.

## Design

- `packages/floorplan/src/messages/en.ts` and `es.ts`: `sheet.limits` becomes one sentence with a
  `{left}` placeholder, and each thing that may be left out is its own key (`sheet.limits.furniture`,
  `.stairs`, `.structure`, `.services`, `.landscape`), joined with the language's own words. The old
  `sheet.limits.stairs` key goes: its case is now one of the combinations.
- `packages/cli/src/sheet/limits.ts`: `notShownNote(plan, floorId, language)` decides, per floor,
  which of the five are drawn: furniture when an item of the furniture group stands on the floor,
  structure when a column stands on the floor or a structural grid is drawn on it, stairs when the
  plan states any (as before, for the whole plan, because a stair joins floors).
- `drawingSheet.ts` and `pages.ts` call it instead of choosing between two fixed sentences.
  The exported `CLIENT_LIMITS` constants had no readers and are removed.
- Decision: fixtures (toilets, kitchen units) are drawn too but were never in the note, so they
  are not added.

## Done

- Tests in `packages/cli/src/sheet/__tests__/limits.test.ts`: bare plan lists all five; furniture
  drawn removes furniture; column or grid removes structure; stairs removes stairs; a plan whose
  furniture is on another floor still lists furniture on this floor; Spanish reads the same;
  the drawing sheet and the client sheet carry the note.
- Typecheck, lint, the sheet, messages and cli test folders, `ownWords` test, scoreboard.
