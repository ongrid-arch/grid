# WRT-14: the floor line, hard to get wrong

## Outcome

An agent writing rooms text gets its floors where it meant them, or is told plainly why not, on
the first refusal:

- `floor ground` is a floor. The name is optional; left out, the floor is named by its id.
- A name is written in quotes. An unquoted word where the name goes is refused, and the refusal
  offers the line with the name quoted (`floor l1 First floor level 1` is answered with
  `floor l1 "First floor" level 1`). Nothing is swallowed silently.
- A name that reads as a setting (`"elevation=0"`) is refused, and the setting is read where it
  belongs.
- The forms agents guess for a setting are read as `key value`: `elevation=0`, `elevation:0`,
  `elevation: 0`, `elevation = 0`, `Level 1`; `name "Ground floor"` gives the name.
- `level` is the storey number: a whole number, or a half for a half level. A level with a unit
  (`level -9ft`) or another fraction (`level 2.85`, `level 3.2`) is refused, and the refusal says
  to write `elevation` for a height above the ground.
- A word written twice on one floor line is refused.
- Every refusal of a floor line quotes the whole form,
  `floor <id> ["<name>"] [level <n>] [elevation <m>] [height <m>] [slab <m>] [building <kind>] [copy <floor> [with openings]]`,
  and says what each word measures, including that the floor-to-floor height is the height below
  plus the slab above (so a floor-to-floor figure is not written as `height`).
- Reading a plan back as rooms text still loses nothing: a plan whose level is neither whole nor
  a half (allowed by the plan file) gives that level in `raw floor`.

## Design

- `rooms/words.ts`: `wordsOf` keeps working as it does; a sibling, `quotedWordsOf`, says of each
  word whether it was written in quotes, from the same splitting.
- `rooms/compile.ts`, `stFloor`: reads the line's words with their quotes; normalises
  `key=value`, `key:value`, `key: value` and `key = value` for the floor line's own keys
  (case-insensitive) into `key value`; reads the optional quoted name or `name <text>`; refuses an
  unquoted name, a key=value name, an unknown word, a key with no value, a key written twice, and a
  level that is a length or not a whole or half number. `raw floor` may hold `level` too.
- `rooms/read.ts`: a floor whose level is neither whole nor a half writes no `level` on its floor
  line and gives it in `raw floor`, so the read-back writes again.
- The floor line's refusals move into the message files (`messages/en.ts`, `messages/es.ts`, keys
  `rooms.floor.*`) and are said with `say`, so `compile.ts` holds fewer English sentences and
  `packages/cli/src/__tests__/ownWords.test.ts` has its count lowered (one number, outside this
  area).
- Decisions:
  - An unnamed floor is named by its id (`ground`), not by a made-up name: predictable and the
    read-back writes it as it is.
  - An unquoted name is refused rather than guessed: a guess is what swallowed words before. The
    refusal offers the fixed line, so it costs one call.
  - Level allows halves because the plan file does (a half level between two floors). Any other
    fraction is almost always metres meant as a height.
  - No new code: every refusal stays `rooms/syntax` (or `rooms/units`, `rooms/duplicate-id`), as
    floor-line refusals were.
  - No new convention in `types/floorplan.ts`.
- Not here (other areas): the agent guide's sample (`packages/cli/src/guide/guide.ts`) shows only
  `level`; it would gain from showing `elevation` and `slab` too.

## Done

- `packages/floorplan/src/rooms/__tests__/floorLine.test.ts`: each form above, accepted or refused
  with the form in the message; fails before the change.
- A read-back test: a plan with level 0.25 reads back and writes again unchanged.
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/floorplan`,
  `packages/cli/src/__tests__/ownWords.test.ts`, `packages/rules/src/result/__tests__/contract.test.ts`,
  `npm run scoreboard` (no count worse).
- `docs/rooms-first.md` has a floor-line bullet; `changes/WRT-14.md` the fragment.
