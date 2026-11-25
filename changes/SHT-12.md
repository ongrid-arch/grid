# 2026-11-25: a client sheet refuses claim words and lists what is under your access figures (SHT-12)

## For people

- A client sheet's headline, intro and floor paragraphs may no longer say the building is
  accessible, wheelchair-friendly, barrier-free, complies, passes or is approved: Grid refuses
  the words, names the field and the words, and writes nothing. Words in quotation marks are left
  alone. When your brief holds access figures, the sheet's first page now lists each door,
  corridor and turning space that measures under one of them, in Grid's words.

## For agents

- `grid_sheet` with layout `client`, and `grid sheet`, refuse `sheet` words (the argument or
  `sheet.json`) that hold an approval word (MSG-3) or an access claim (accessible, wheelchair
  friendly, barrier-free, "meets the standard" and their Spanish kin): the refusal reads
  `The sheet words: <field> says "<word>", which Grid does not print as a claim...`. Reword with
  what the plan holds, or quote the words.
- The client sheet's first page gains notes `Under your figure of <figure>: ...` for each door,
  corridor and turning space under the person's own `door_width`, `corridor_width` or
  `turning_circle` in the brief beside the plan (at most six, then one line pointing to
  `grid_measure what=access`). No brief or none under: no note.
- No new code in the record.
