# ARE-43: note a flat whose only way in from the common parts has no door

## Outcome

A flat that is entered only through doorless openings or open sides, never through a door, gets
a worth-a-look note, `flat/entrance-without-door`, worded about the flat by its name. Before, such
a flat counted as entered and `grid check` said nothing, though nobody can lock or close it
against the common stair. A flat with at least one real front door, or one joined by a stair, gets
no note. A flat with no way in at all keeps `flat/no-front-door`; the two never both name a flat.

## Design

- `packages/floorplan/src/geometry/rules/check.ts`, `frontDoorFindings`: it already marks a flat
  as entered by every way across to a room of another flat or of none, onto the outside at the
  ground, onto a common part or a space not drawn. It now also records, for each flat, whether any
  of those ways is a door (an opening of type `door`) or a stair. A way that is an opening of type
  `opening`, or an open side (a way that is no opening of the plan), is doorless. An entered flat
  with no door and no stair way gets the new finding `flat_entrance_without_door`, on the floor of
  the flat's first room, its rooms the flat's. `graph.ts` is not touched.
- `types.ts` gets the code; `inspect.ts` maps it to `flat/entrance-without-door` with the flat as
  its thing; `catalogue.ts` gives it one wording, what is needed and the fix; words in `en.ts`
  (source) and `es.ts` (draft); `notes/notes.ts` gives the drawn note its title.
- Decision: a way between two flats (through a wall the plan did not mark separating) already
  counts as entering both, as before; the new note follows the same ways, so it does not change
  which flats are entered.
- Decision: a stair counts as a door-like way in, so a duplex joined to the common stair is never
  noted for it.
- Decision: the note is a drawing-check finding like `flat/no-front-door` (kind `finding`, no failure): the card calls it a worth-a-look note, but every route check here is a `finding`.

## Done

- A test in the result record: the core's flat with the hall in no flat and its two doors into
  the flat made doorless openings gives the note; one door among them gives none; an open side
  gives the note; a flat with no way in still gets `flat/no-front-door` only.
- `ownWords`, `tolerances`, the contract test, the packages' test folders, typecheck, lint and the
  scoreboard pass; the scoreboard counts do not get worse.
