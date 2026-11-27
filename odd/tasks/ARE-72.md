# ARE-72: ask about homes missing rooms, odd sizes or misnamed uses

## Outcome

A plan of homes that is missing the obvious, or says one thing in a name and another in a use,
is asked about instead of passing in silence:

- A home with no bathroom, no kitchen or no way in gets a line worth a look after `grid check`
  and `grid_check`, naming the home and what it lacks. A home is each flat the plan lists, or,
  with no flats, the whole plan when it says it is a home (a room used as a bedroom or a living
  room, as the plausibility questions read it).
- The brief offers the usual rooms of a home as assumed lines: when the brief (or no brief yet)
  says nothing of a bathroom, a kitchen or a way in, and a home lacks one, the brief's lines say
  so, `missed (should, assumed)`, for the agent to confirm with the person or write in the brief.
  A survey is left alone, as the brief's reminder leaves it.
- A size question that needs no place and no country: a bedroom, living room or dining room in a
  home under 4 m² of net floor, or narrower than 1.8 m (the widest circle it holds, as
  `grid_measure` gives it), and a kitchen, bathroom or toilet under 0.8 m² or narrower than
  0.6 m, is asked about after the check. A 0.5 m² bedroom and a 1 m wide living room are caught.
- A room in a home whose name says one use ("Bedroom 2") and whose use says another (`living`)
  is asked about, so three bedrooms written as living rooms are queried rather than counted as
  none.

Every one is a question, never a rule: the figures are Grid's own and cite no document.

## Design

- `packages/cli/src/quantities/homes.ts`: the measures for homes, pure, from a `Survey`. It
  works out the homes (`planFlats`, else the whole plan when `buildingKind` says home), what each
  has (by use, or a use its rooms' names say), whether a way leads out of it (`wayGraph`: to the
  outside, an outdoor room, or a room in no flat of its own), each home room's net area
  (`planAreas`) and widest circle (`measureRoom`), and the uses a room's name says
  (`usesInName`, from the use labels and Grid's use words, plus the plain words for the rooms of
  a home). It returns records and their sentences.
- Names and uses: a name says a use when one of its words (or the whole name) is a use, a use's
  label or a word Grid reads as a use; "Kitchen / dining" says two. A room is queried only when
  its name says at least one use, its use is stated, and its use is none of them. A bathroom and
  a toilet, and a utility room and a store, are taken as near enough to say nothing.
- The four new figures are limits in the tolerances table (`homeRoomSmallest`,
  `homeRoomNarrowest`, `homeWetRoomSmallest`, `homeWetRoomNarrowest`) and in
  `docs/tolerances.md`.
- `brief/answer.ts`: `briefMissedText`, which `grid check` and `grid_check` already print after
  the report, adds the homes' questions under their own heading, with or without a brief. No
  change to the check's record or its count: the questions are about the person's homes, not
  the drawing's faults, and adding a code to `packages/rules` is outside this change.
- `brief/lines.ts`: the assumed lines for the usual rooms; a wish that names the use, or whose
  name says it, at any level, is the person's word on it and stops the assumed line. With no
  brief the heading says the lines are the sizes in names and the rooms assumed.
- Words in `messages/en.ts` and `es.ts`; `docs/brief.md` documents both.
- Does not touch `rooms/compile.ts`, the check record, or any convention.

## Done

- `packages/cli/src/quantities/__tests__/homes.test.ts`: a flat with no bathroom, kitchen or
  way in; a 0.5 m² bedroom and a 1 m living room; bedrooms used as living; a well-drawn flat
  with nothing to ask; a name with two uses; an office plan left alone.
- `packages/cli/src/brief/__tests__/homes.test.ts`: the assumed lines with and without a brief,
  silenced by a wish for the use; the questions in `grid_check`'s text.
- The tolerances test, the own-words test, typecheck, lint, build; vitest on the folders changed.
