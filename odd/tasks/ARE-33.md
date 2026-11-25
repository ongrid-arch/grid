# ARE-33: keep counts and areas apart in brief wishes

## Outcome

A brief wish can ask for "at least 4 toilet rooms" or "at most 2 kitchens" in fields of its own,
`count_at_least` and `count_at_most`, apart from the area fields. `at_least` and `at_most` stay
square metres. A wish for the rooms of a use that gives `at_least` or `at_most` as a small whole
number with no area unit in its quote reads like a count, so it is refused and the refusal says
to use `count_at_least` or `count_at_most`. Six toilet rooms drawn against "at least 4" read met
because six is at least four, and a line never again reads a count as square metres.

## Design

- `packages/cli/src/brief/brief.ts`: `RoomWish` gains `countAtLeast` and `countAtMost`, in the
  file as `count_at_least` and `count_at_most` (whole numbers 0 to 1,000). They may not be
  combined with `count` or each other's contradiction (least above most is refused). In
  `briefJson` they are written back.
- The refusal: a wish with `use` and no `name`, an `at_least` or `at_most` that is a whole
  number up to 30, and a quote with no area unit (m², m2, sqm, square, metre, ft) is refused. Rooms
  of a use are rarely sized in whole square metres under 30 with no unit said, and the refusal is
  easy to undo: say the unit in the quote or give `count_at_least`.
- `lines.ts`: a count line holds when the drawn rooms are at least, at most or exactly as asked,
  and says "asked at least 4, drawn 6".
- `layout.ts`: places as many rooms as `count_at_least` asks.
- `mcp/briefTool.ts`: the two fields in the schema and their descriptions, `at_least` and
  `at_most` described as area only.
- `docs/brief.md` page and `changes/ARE-33.md`. No new convention and no new message code.

## Done

- `brief/__tests__/brief.test.ts`: the fields are read and written back, refused beside `count`,
  and an `at_least` count on a use wish is refused naming the right field; with an area unit it is
  kept.
- A line test: six toilet rooms against `count_at_least: 4` is met with "at least 4, drawn 6",
  three is missed, and `count_at_most` likewise.
- The tool schema test and the whole cli folder, ownWords and tolerances tests pass.
