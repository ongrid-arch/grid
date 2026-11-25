# WRT-34: lengths in rooms text read in the plan's unit, never as a sum by surprise

## Outcome

- In rooms text whose `display` line is not metres (`display ft-in`, `display mm`,
  `display cm`), a number written with no unit is never taken as metres without a word saying
  so. The display line may say what a plain number is, `numbers <m|cm|mm|ft>`
  (`display ft-in numbers ft`, `display mm numbers mm`), and every plain number is then read in
  that unit: `room family "Family room" living 18 x 20` is 18 ft by 20 ft, `4800 x 3600` is
  4.8 m by 3.6 m. Without `numbers`, a plain number other than 0 is refused as `rooms/units`, a
  question that names the plan's unit, the number with its unit (`18ft`, `4800mm`) and the
  `numbers` word, so nothing is drawn in a unit the person did not mean.
- In a text read in feet (a `display ft-in` line, or `numbers ft`), `12-6` is refused as
  `rooms/units`: it reads as 12 minus 6, and the refusal names `12'6"` and `12ft6in` for twelve
  feet six inches and `(12-6)` for the difference. Before, it was drawn as 6 m.
- The read-back writes `numbers m` on the display line of a plan whose display is not metres,
  since it writes its lengths in metres, so writing the reading gives the same plan.
- A text with no display line, or `display m`, reads a plain number as metres, as before.

## Design

- `packages/floorplan/src/rooms/words.ts`: `numberOf` and `pointOf` take how a plain number is
  read (`PlainNumbers`: the display's length unit and the `numbers` unit, or none). A word with
  its unit is read as before. A plain word is checked for the feet-and-inches look first, then
  read in the `numbers` unit, or refused when the display is not metres and no `numbers` was
  given. 0 is 0 in any unit and is never asked about. The default is metres, so every other
  caller is unchanged.
- `compile.ts`: the display line takes `numbers <m|cm|mm|ft>`, kept by the compiler only: it is
  how this text is written, not how the person reads the plan, so it is not stored in the plan
  (no new convention in `types/floorplan.ts`). The text's display line is found before any line
  is read, so a length above the display line is read by the same rule. Every length the
  compiler reads goes through the rule; the two numbers that are not lengths, a repeat's count
  and a floor's storey number, do not.
- `read.ts`: the display line it writes gains `numbers m` when the display is not metres.
- The words are in `messages/en.ts` and `messages/es.ts` (`rooms.numbers.*`), said through `say`.
- Why a question and not feet by default: Grid's own guide said for a long time that a plain
  number is metres, so an agent may write metres under `display ft-in`; read as feet, that
  plan would shrink to a third with no word. Refusing until `numbers` says which is safe both
  ways, and the refusal gives the one word to add.
- `12-6` is refused only when the text reads feet; in metres a sum such as `3.0-0.3` stays.
- Left out, on purpose: a text with no display line written over a plan file whose display is
  feet is still read in metres. The plan's display is read by `grid write` after the text is
  compiled (`packages/cli/src/command/write.ts`), outside this change's area; named in the
  report as a follow-up.

## Done

- `packages/floorplan/src/rooms/__tests__/units.test.ts`: under `display ft-in numbers ft` an
  18 x 20 room is 5.4864 m by 6.096 m; under `display mm numbers mm` sizes and positions in mm
  give the same plan as metres; under `display ft-in` with no `numbers` a plain 18 is refused as
  `rooms/units` naming `18ft` and `numbers ft`, while `0,0` and lengths with their unit pass;
  `12-6` under feet is refused naming `12'6"`, and `(12-6)` is 6 ft; in metres `12-6` is still
  6; the read-back of a feet plan writes `numbers m` and writes the same plan again.
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/floorplan`,
  `packages/cli/src/__tests__/ownWords.test.ts`, `packages/rules/src/result/__tests__/contract.test.ts`
  and `npm run scoreboard`.
