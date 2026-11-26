# WRT-69: a floor line names its real fault, a missing quoted name or a word with no value

## Outcome

An agent who writes a floor line wrong is told what is wrong with it, not only that a word is
not understood:

- A number right after the floor's id (`floor g 0`, `floor l1 1 "First"`) stands where the name
  goes. The refusal says so, that a name is written in quotes after the id, and, when the number
  can be a storey number, offers the line with it written `level <n>`.
- A quoted name written after the settings (`floor g level 0 "Ground"`) is refused saying the name
  goes right after the id, with the line written that way.
- A known word with nothing after it (`floor g level 0 slab`) says what it takes: `slab <m>` and
  what that figure measures, instead of only "needs its value after it".
- A walls, doors or windows line that ends on one of its known words (`walls outside 0.3 height`)
  says the word needs its value after it, where it said the word was not understood while listing
  it among the known words. A floor's own word on a walls line (`walls outside 0.3 slab 0.2`) says
  it is written on the floor line.

What is read is unchanged: every line that was read before is read the same, and only refusals
change their words. The code stays `rooms/syntax`.

## Design

- `packages/floorplan/src/rooms/compile.ts`, `stFloor`: the number-in-the-name's-place branch and
  the quoted word met among the settings get their own refusals, each offering the fixed line
  (built from the line's own words, as `rooms.floor.unquoted` already does). The `noValue` refusal
  adds the word's own part of the form and what it measures, one message per floor word.
- `readPairs` (the walls, doors and windows lines): a known word with nothing after it is refused
  as needing its value; a floor word (`slab`, `elevation`, `level`) points to the floor line with
  the existing `rooms.raw.floorField.line`; the remaining refusal moves to the message files.
- The sentences are Grid's own words in `packages/floorplan/src/messages/en.ts`, with draft Spanish
  in `es.ts`. Moving the walls line's sentence lowers `compile.ts`'s count in
  `packages/cli/src/__tests__/ownWords.test.ts` by one.
- Decisions: a number after the id is offered as `level <n>` only when it is a storey number (a
  whole number or a half) and the line has no level yet; otherwise only the quoted name is offered.
  A second quoted word after a name stays the plain "not a word a floor line knows".

## Done

- `packages/floorplan/src/rooms/__tests__/floorLine.test.ts`: each case above refused with its new
  words and fixed line (failing before the change), and the offered line read without a problem.
- `wallsLine.test.ts` or the same file: the walls line's trailing word and floor word.
- `tsc --noEmit -p packages/floorplan`, lint, the rooms tests, `ownWords.test.ts`,
  `tolerances.test.ts`.
