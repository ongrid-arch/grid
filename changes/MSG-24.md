# 2026-11-25: Grid's printed words in any language, supplied by the agent (MSG-24)

## For people

- Drawings, sheets, the check and descriptions come out in whatever language you ask for, not
  only English and Spanish: your agent writes Grid's words in your language into the plan
  (`display.words`) and every output prints them, with no translation file to maintain. `--lang`
  and `display.language` take any language tag (`de`, `fr`, `pt-BR`); a word Grid has no wording
  for in that language stays in English (MSG-24).

## For agents

- New tool `grid_words` (after `grid_write_brief`): with `language` and `output` (`drawing`,
  `sheet`, `check`, `describe`) it lists the keys that output prints for this plan, each with its
  English wording, placeholders and current word, and writes nothing; with `words` (a map from key
  to wording) it checks each word against the English key's placeholders, refuses a bad one by
  name with none written, and writes them into `display.words[language]`; `plan_language` and
  `decimal` set the plan's display. 37 tools.
- `language` on `grid_check`, `grid_describe`, `grid_view`, `grid_sheet` and `grid_export`, and
  `--lang`, take any BCP-47 tag, read as its primary language; a word that is no tag is refused.
- An answer that printed some of Grid's words in a language with no word for them ends with one
  line saying how many and that `grid_words` gives them.
- A plan word the reader cannot take (a key Grid does not have, a placeholder that differs from
  the English key's) is a reading line at `display.words.<language>.<key>`; no new code in the record.
- New message key `floor.ground`, the name of the floor a plan with no floor list stands on.
