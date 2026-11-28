# WRT-87: the rooms text a plan was written from, read back as it was written

## Outcome

An agent that writes a plan rooms first and reads it back (`grid describe --as rooms`,
`grid_describe as=rooms`) gets the text it wrote, not every room, wall and door spelled out:

- A plan written from rooms text keeps that text in its `written` record (`written.text`). While
  the text still writes the plan as the file holds it, the read-back gives it back as it was
  written: its units and repeats, its copied floors and rooms `through` floors, its own
  lengths in its own units (`1400` under `display mm numbers mm`, never `1.4`), its comments and
  its order. Only its `based on` line is set to the plan as it is now, so a change made to it
  and written again is checked against the right version.
- When a tool has since added what the text has no line for (an item, a stair, a column, a
  grid, a bay or ramp, a note or the sketch), the read-back is the kept text with those parts'
  lines added at its end, so a change made with a tool after a write costs one line, not the
  whole plan written out again.
- A plan name changed since (`grid_set_plan`) is written on the `plan` line, and the person's
  language on the `display` line (`display mm language es`, or `display language es` alone),
  which `grid write` and `grid_write_rooms` now read: the language survives a read-back written
  to a new plan file.
- A text that no longer writes the plan as it is (walls moved by an edit, a floor added by a
  tool) is not given: the read-back is worked out from the plan as before, and still states the
  language.
- Either way, what the text does not hold (the plan's part types, opening patterns, trace
  image, the facts on walls and openings and the like) is named in one comment line at the top,
  with the fact that `grid write` keeps it only over this same plan file, so a text written to a
  new file never drops it unseen.

## Design

- `packages/floorplan/src/types/floorplan.ts`: the `written` record (WRT-2) gains an optional
  `text`, the rooms text Grid last wrote the plan from. It is no new numbered convention: it
  extends WRT-2's record, is optional, never defaulted, and a plan with none reads as before.
- `packages/floorplan/src/rooms/stamp.ts`: `stampFor` takes the text; `canonical` is shared so
  the read-back compares plans as the revision does.
- `packages/floorplan/src/rooms/language.ts` (new): the `language <tag>` words of a `display`
  line, taken out of the text before it is compiled (the line kept, so line numbers stay), and
  the language they name. The compiler (`compile.ts`) is not touched: `grid write`
  (`command/write.ts`), the read-back's own check and `grid_write_building`
  (`edit/buildingEdits.ts`) take the words out first. Those two CLI files change by a line or
  two each.
- `packages/floorplan/src/rooms/read.ts`: before working the text out, `keptText` tries the kept
  text: its `based on`, `plan` and `display` language lines set to the plan's, then the lines
  of the parts it lacks added at its end; each candidate is written again and compared with the
  plan part by part (every list the text writes, numbers to a tenth of a millimetre). The facts
  on walls, openings and floors, which `grid write` carries by id, and the parts the text never
  writes, are left out of the comparison and named in the note. The first candidate that gives
  the plan back is the reading. The worked-out reading gains `language` on its `display` line
  and the same note.
- `packages/cli/src/command/write.ts`: keeps the text in `written`, and the text's language in
  the file's `display`.
- Decisions: the text is kept in the plan file, not beside it, so it travels with the plan
  (a copy, an undo, a commit) and is always checked against it before it is used; a stale text
  is only ignored, never trusted. A worked-out reading still writes metres; writing it in the
  person's units is left for later.

## Done

- `packages/floorplan/src/rooms/__tests__/keptText.test.ts`: a hotel floor with a unit and two
  repeats, a tower with a copied floor and a room `through` floors, and a millimetre plan read
  back as written; an item and a column added after the write read back as one line each at the
  end; a renamed plan and a language written on their lines; a moved wall falls back to the
  worked-out reading; the note names the parts types a new file would lose.
- `packages/cli/src/command/__tests__`: `grid write`, `describe --as rooms`, write to a new file
  and read again keeps the name, the language and the text.
- `npm run build`, `npm run typecheck`, `npm run lint`, the touched folders' tests, the tool and
  command tests, `npm run scoreboard`.
