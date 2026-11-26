# 2026-11-26: every answer kept to about 20 KB, with page and whole (CMD-39)

## For people

- On a large plan (a tower of forty floors, a building of a thousand rooms) Grid's tool answers no
  longer run to hundreds of kilobytes that an agent's host refuses: each is kept to about 20 KB
  and says what it left out and how to get the rest (CMD-39).

## For agents

- An answer larger than about 20 KB, its text and its data together, is shortened by the server:
  runs of like lines keep their first two, then the text keeps its head and its last lines, then
  the longest lists of the data keep their first items. The line after the label says how large
  it was whole, what was left out and how to get the rest, and `left_out` in the data gives
  `whole_bytes`, `budget_bytes`, `pages`, `text_lines` and each list cut (`path`, `shown`, `of`,
  and `from` with `page`). An answer that fits is unchanged.
- Every tool but the preview's takes `whole: true` for the answer whole. The tools that only read
  take `page` (from 1): a piece of the text and a stretch of each list cut, so the pieces together
  hold the whole answer. A page the answer does not have is refused with how many there are.
  No new code in the record.
