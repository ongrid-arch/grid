# 2026-11-25: plain numbers in rooms text read in the plan's unit, and 12-6 refused in feet (WRT-34)

## For people

- In rooms text with a `display` line that is not metres, a number with no unit is no longer drawn in metres without a word. Add `numbers ft` (or `numbers mm`, `numbers cm`, `numbers m`) to the display line and every plain number is read in that unit: under `display ft-in numbers ft`, an 18 x 20 family room is 18 ft by 20 ft. Without it, a plain number is refused with the number written with its unit and the word to add. In a text read in feet, `12-6` is refused rather than drawn as 6: write `12'6"` or `12ft6in`, or `(12-6)` for the difference (WRT-34).

## For agents

- `grid_write_rooms` and `grid write`: the display line takes `numbers <m|cm|mm|ft>`, what a number with no unit is; it is how the text is written and is not stored in the plan. Under a display that is not metres and no `numbers`, a plain number other than 0 is refused as `rooms/units`, naming the number with its unit and `display <unit> numbers <unit>`. Before, it was read as metres. A text with no display line, or `display m`, reads plain numbers as metres as before.
- In a text read in feet (`display ft-in`, or `numbers ft`), a word such as `12-6` is refused as `rooms/units`, naming `12'6"`, `12ft6in` and `(12-6)`. Before, it was read as the sum 12 minus 6, in metres.
- `grid_describe as=rooms` writes `numbers m` on the display line of a plan whose display is not metres, since it writes its lengths in metres; writing the reading gives the same plan.
- No new code in the record.
