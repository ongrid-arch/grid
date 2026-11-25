# 2026-11-25: a count of rooms apart from an area in a brief wish (ARE-33)

## For people

- A brief can ask for "at least 4 toilet rooms" or "at most 2 kitchens" with `count_at_least` and
  `count_at_most`, and the line says "asked at least 4, drawn 6". `at_least` and `at_most` stay
  square metres, and a small whole number there on the rooms of a use, with no unit in the quote,
  is refused instead of being read as m² (ARE-33).

## For agents

- `grid_write_brief` room wishes take `count_at_least` and `count_at_most` (whole numbers, not with
  `count`). `at_least` or `at_most` of a whole number up to 30 on a wish with `use` and no `name`,
  whose quote says no area unit, is refused with a message naming the count fields. A count line's
  `asked` reads "at least 4" and its `unit` is "rooms". No new code in the record.
