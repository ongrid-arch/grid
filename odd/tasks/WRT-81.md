# WRT-81: existing, demolished and new in rooms text

## Outcome

An agent writes a renovation in rooms text, the way it writes any plan, and reads one back the
same way. It never has to fall back to `raw` JSON lines, or hand-edit the plan file, because a
part has a phase (CNT-10's `existing`, `demolished` and `new`, C16):

- `phase <existing|demolished|new>` on a room, door, window, opening, `place` or `repeat` line
  says the part's phase. `phase <word>` alone on a line sets it for the room and opening lines
  after it, so a survey is one `phase existing` line, and "everything below is new" one more.
- The walls follow the rooms. Grid works the text out twice, as the building stands before the
  work (its existing and demolished rooms and openings) and after it (existing and new), and
  compares the two: a wall in both is existing, one only before is to be demolished, one only
  after is new. A door between two rooms that stand only before the work is demolished with them.
- `phase <word>` on a `wall` line sets that wall's phase whatever the rooms say: an existing wall
  marked for demolition between two rooms that both stay.
- `grid describe --as rooms` writes these words back, so a plan with one demolished wall, or a
  survey marked existing, reads back as rooms text and writes the same plan again, not as a floor
  of raw lines.
- `grid write` over a plan with phases no longer refuses a text that holds them. It refuses only
  a text that states no phase at all, and then says what is true: that text, and `--replace`,
  would write every part with no phase; reading the plan back writes each part's phase.

## Design

- `packages/floorplan/src/rooms/phases.ts` (new): the phase words.
  - `phasedText(text)` finds the words outside quotes and comments, line by line, refusing a
    phase that is not one of the three. A text with none is not phased, and is written exactly
    as before (no second writing, no change for every text written today).
  - `stateText(text, state)` is the text as one state reads it: the room, opening, place and
    repeat lines of the other state, and the opening, wall, rename and remove lines that name a
    room left out, are made blank lines (so every line keeps its number), and the phase words are
    taken out of the rest. `compileRoomsText` writes each.
  - `mergeStates(before, after)` is the one plan: the after state's floors and every other part;
    walls paired by id when the same, then by their place (same ends, thickness, height, kind,
    floor) under the after state's id, so the wall between a room that stays and one rebuilt the
    same size is one existing wall; what remains is demolished (before only) or new (after only).
    A wall, room or opening with one id and two shapes keeps its id after the work, new, and the
    one before becomes `<id>-before`, demolished, the same rule the edits follow (`edit/phases.ts`,
    WRT-15). Walls and rooms in both states state `existing`; an opening in both states keeps
    what it states, so it goes with its wall (CNT-10's reading). Then each wall line's own phase.
  - A problem only one state has says which: "Read as the building before the work" or "after
    the work", so a room placed beside a demolished one is plain. A fix offered for a line keeps
    its phase words.
  - A fit-out (`base`) is the work itself: phase words there are refused.
- `rooms/compile.ts`: `compileRoomsText` sends a phased text to `phases.ts`; the one-state
  compiler is unchanged. The header lists the words.
- `rooms/read.ts`: in a plan with phases, a `phase existing` line at the top, `phase new` or
  `phase demolished` on a room or opening line that is not existing (an opening that goes with
  its wall says none), and on a wall line when the wall's phase is not the one its rooms give it.
  The check by writing again compares each part's phase as the plan reads it (`phaseReading`),
  so an unstated phase and `existing` are the same, and a plan with phases and one without are not.
- `packages/cli/src/command/write.ts` (outside the rooms area, the one refusal): refused only
  when the plan has phases and the written text states none; the wording moves to the message
  files.
- The grammar served to agents (`packages/cli/src/mcp/roomsGrammar.ts`, `docs/rooms-first.md`)
  gets a phases topic with an example Grid writes.
- Messages in `messages/en.ts` and `es.ts`; no new check code (rooms text refusals use
  `rooms/phase` and the existing `rooms/phases` of `grid write`).

Decisions: the word is `phase <word>`, not a bare `new`, because a bare word would read as a
room's id in `north of new` and on a line that names rooms. A wall the two states cut
differently (a building extended along its side) is written as the old wall demolished and the
new one built; the drawing is right in each state. Items, stairs, columns and the other parts
stand after the work, as they do today.

## Done

- `packages/floorplan/src/rooms/__tests__/phases.test.ts`: a survey marked existing; a room
  demolished and two new ones in its place, with the shared walls kept and the doors following;
  an existing wall marked demolished; a problem in one state named so; an unknown phase refused;
  a fit-out refused; a text with no phase words writes the same plan as before.
- Read-back tests: the plans above, and one phased by `phaseCounts`-style marks, read back with
  phase words and no raw lines, and write the same plan again.
- `packages/cli` write test: a phased text writes over a phased plan; a text with none is refused
  with the new words.
- `roomsGrammar.test.ts` writes the new example; `ownWords.test.ts` counts.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders changed, `npm run scoreboard`.
