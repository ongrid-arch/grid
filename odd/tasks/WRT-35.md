# WRT-35: a room line's refusal names every word it takes, and the word most likely meant

## Outcome

An agent that writes a word a room line does not take is refused with a list of every word a room
line takes, `floor <m>` (the room's floor above or below its storey's) and `height <m>` (its own
ceiling) among them, and, when one is likely meant, the word with its value: `level 0.6` on a room
line is answered "Did you mean 'floor 0.6'?". So no agent reads the refusal as Grid having no word
for a room that stands higher than its storey, and works around it in the room's name.

## Design

- `packages/floorplan/src/rooms/compile.ts`: the room line's last branch, the refusal of a word it
  does not understand, says the new message instead of its own English sentence, which also takes
  one sentence off the file's count of English left to move.
- The near miss: a short table of the words agents write for a room line's words (`level`,
  `elevation` and `offset` for `floor`; `ceiling` and `headroom` for `height`; `thickness` for
  `walls`), then `likelyMeant` (`types/nearest.ts`, Grid's one place for a word most likely
  meant) over the room line's own words, for a slip (`hieght`). A word that takes a value is
  suggested with the value written after the unknown word, so the suggestion is the line's fix.
  No guess when neither finds one: the list still names every word.
- `packages/floorplan/src/messages/en.ts` and `es.ts`: `rooms.room.unknown` and `rooms.room.meant`.
  The list's tenures and outdoor kinds come from the schema's lists, so a new one is named too.
- The code stays `rooms/syntax`: no new code in the record.

## Done

- `packages/floorplan/src/rooms/__tests__/roomWords.test.ts`: `level 0.6` on a room line is refused
  naming `floor 0.6`; the refusal names `floor <m>`, `height <m>`, `first-wall` and the rest of the
  room line's words; a slip (`hieght 3`) is answered with `height 3`; a word with no near miss
  gets the list and no guess. It fails before the change (the old refusal names neither floor nor
  height and guesses nothing).
- `packages/cli/src/__tests__/ownWords.test.ts` with compile.ts's count one lower.
- Type check, lint, the floorplan package's tests and the scoreboard.
