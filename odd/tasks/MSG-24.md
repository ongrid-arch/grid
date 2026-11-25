# MSG-24: Grid's printed words in any language, supplied by the agent

## Outcome

A person can have their plan drawn, sheeted, checked and described in any language they ask for,
and Grid ships no translation file for it:

- A plan may keep its own words for Grid's keys, one map per language, in `display.words`
  (convention C32). The drawing, the sheet, the drawing file exports, `grid check` and
  `grid describe` print those words when they write in that language. A key the plan gives no
  word for is said from the language's shipped file (Spanish today), else in English.
- The agent, who speaks the person's language, asks Grid with one tool, `grid_words`, for the keys
  an output prints for this plan (the drawing, the sheet, the check, describe), each with its
  English wording and its placeholders and the word the language has now, translates them itself
  and writes them back with the same tool. Grid checks each word: a key Grid does not have, a
  placeholder that differs from the English key's, text the text rule refuses or a word that
  reads as approval is refused by name, and nothing is written.
- Any BCP-47 language is taken (`de`, `fr`, `pt-BR`, `zh`) on the command line (`--lang`), in a
  tool's `language` and in `display.language`; a tag with a region is read as its language, as
  before (`pt-BR` is `pt`). With no word for a key the output prints, Grid writes that key in
  English, and the tool's answer says so once: how many words were in English and that
  `grid_words` gives them.
- A word in the plan whose placeholders do not match the English key's is left out when the plan
  is read, with a reading line that names it (`display.words.de.<key>`), and the English is used.
- The decimal mark still comes from the display (`decimal`), never from the words; a language
  Grid ships no file for writes a point unless the display says comma. Room names are the
  person's own and never translated. English words cannot be replaced: English is the source.

## Design

- `packages/floorplan/src/messages/languages.ts`: `Language` is any language Grid may write in, a
  lower-case primary language subtag (`de`); `ShippedLanguage` (`LANGUAGES`, `en` and `es`) is a
  language with a file. `readLanguage` reads any well-formed BCP-47 tag as its primary subtag.
  `LANGUAGE_DECIMAL`, `LANGUAGE_STATUS` and `GROUND_FLOOR_NAME` stay keyed by shipped language and
  are read through functions that fall back (a point; English's ground floor name).
- `packages/floorplan/src/messages/words.ts` (new): the plan's own words. `wordProblem` checks
  one word against the English key (known key, same placeholders, the text rule, a length
  limit); `readPlanWords` keeps the sound words of a `display.words` and lists the rest; and
  `setPlanWords` hands one plan's words to `say` (the command and every tool call that reads a
  plan does it through `languageFor`, which already loads a language's file, so a call never
  says another plan's words). `listenForKeys` records the keys said in a language other than
  English while an output is made, so the tool lists only what the output prints for this plan
  and the hint counts only those keys.
- `say.ts`: a key's wording is the plan's word for the language, else the language's shipped
  file, else English (`hasWording` tells which keys a language has). The decimal mark of a
  language with no file is a point.
- `types/floorplan.ts`: C32 in the header; `display.language` takes any language;
  `display.words` is a map from language to a map from key to text, read leniently.
- `types/readParts.ts`: before the schema, the plan's words are read with `readPlanWords`; each
  word left out is a `value-left-out` reading line at its place (`display.words.de.<key>`), so
  `grid check` names it. A words field that is no map is left out alone, the rest of the display
  kept.
- `packages/cli/src/mcp/wordsTool.ts` (new): `grid_words`, written once like the other tools, a
  `write-file` tool placed after `grid_write_brief`. With `output` it makes that output for the
  plan in the language (the same code the tools use: `grid_view`, `grid_sheet`'s `makeSheet`,
  `grid_check`, `grid_describe`), listening for keys, and lists each key with its English, its
  placeholders and the language's word now, missing first; it writes nothing. With `words` it
  checks every word, merges them into `display.words[language]` (or replaces them with
  `replace`) and writes the plan file, changing nothing else in it; `plan_language: true` also
  makes the language the plan's own (`display.language`). The tool refuses `en`.
- `serveTools.ts`: every tool answer but `grid_words`'s listens for keys; when some key said in a
  language has no word there, one line is added to the answer.
- `command/language.ts`: `--lang` and `language` take any language; `languageFor` installs the
  plan's words for the language it settles on.
- Decisions: words are kept per primary language (a region or script is not told apart, as
  `es-MX` is `es` already); the list is made by making the output, so it is short and exact for
  this plan, and a later change that prints a new key is caught by the hint; use labels and the
  unnamed ground floor are not message keys and stay English in a language with no file (the
  agent can name the floor and the rooms in the person's words).

## Done

- `messages/__tests__/planWords.test.ts`: plan words win over the shipped file and English; a bad
  placeholder, an unknown key and `en` are refused; any BCP-47 tag is read; the decimal mark of a
  language with no file is a point unless stated.
- `types/__tests__` (reader): a plan with a bad placeholder in `display.words` is read with that
  word left out and a reading line naming `display.words.de.<key>`, the rest of the display kept.
- `packages/cli/src/mcp/__tests__/words.test.ts`: on a plan with German words, `grid_view` (the
  drawing), `grid_sheet` (the sheet) and `grid_check` print the German; `grid_words` lists keys for
  each output and writes words; a bad placeholder is refused and nothing written; a language with
  no words answers in English with the one hint.
- `tools.test.ts` with the new tool in its order and count; `ownWords.test.ts`,
  `tolerances.test.ts`, `contract.test.ts`; `npm run typecheck`, `npm run lint`, the floorplan,
  rules and cli test folders, and `npm run scoreboard`.
