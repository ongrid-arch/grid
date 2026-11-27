# Languages

Read this when you add or change a sentence Grid writes, or add a language.

Grid writes its own words, in reports, notes, errors, drawings and files, in the person's
language (MSG-11). Every sentence is a key in a message file, with its numbers and names as
values. Grid ships the files for English and Spanish; for any other language the agent writes
Grid's words into the plan itself (MSG-24, [below](#words-the-plan-keeps-for-a-language)), so
nobody writes a translation file per language. Agents get the same codes and values, and retell them in the person's
language. Room names are never translated: they are the person's own words.

## The message files

- `packages/floorplan/src/messages/en.ts`: English, the source. Every key is written here first.
- `packages/floorplan/src/messages/es.ts`: Spanish. **Status: draft translation, not reviewed.**
- `packages/floorplan/src/messages/uses.ts`: the one fixed list of room uses (`ROOM_USES`), with
  its label in each language.

A key names what it says: `label`; `join.*`, the words a list is joined with; `thing.*`, how a
line names a part; `read.*`, what the reader found and what the format wants; `issue.<code>`, a
drawing check's own sentence; `check.*`, a plan check's finding or notice, its title and its
limits; `line.<code>.<field>`, the result record's `message` (`says`), `found`, `needed` and
`fix`; `report.*` and `tool.check.*`, the words of a report around its lines; `describe.*`,
`drawing.*` and `sheet.*` for those outputs (`drawing.*` also holds a file's own words, said in
English); `edit.*`, an edit's refusals and notes, said in English as the edits' answers are. A last part
after the field (`.one`, `.many`, `.none`) is one wording of several, chosen by the code.

A wording holds named placeholders, `{width}`. `say(language, key, values)` fills them:

| Value | Written as |
|---|---|
| `name("Kitchen")` | `"Kitchen"`: a name or id from the plan, quoted, never translated |
| `num("0.80")` | a figure as Grid rounds it, with the language's decimal mark: `0,80` in Spanish |
| a number | a count, with the decimal mark |
| `said(key, values)` | another sentence, in the same language |
| `joined([...], 'join.comma', 'join.and')` | a list, joined with the language's words |
| a plain string | as it is: an id path such as `walls[2].thickness`, never words |

## The language setting

A plan may state its language in its `display` (`"display": { "language": "es" }`), and a
command or a tool call may ask for one (`--lang es` on `grid check`, `describe`, `draw` and
`sheet`; `language: "es"` on every tool, MSG-34), which wins. `grid_set_plan` sets the plan's
language; `grid_write_rooms` records it when the plan states none, from the call's `language` or
the language the rooms' names are plainly in (`languageOfNames` in `uses.ts`). Every tool's answer
is in the language: `grid_check`, `grid_describe`, `grid_view`, `grid_sheet`, `grid_areas` and
`grid_schedule` in their own words, and every other tool, whose sentences are English yet, closes
with one line in the language saying so ([the tool server](tool-server.md#the-language-of-an-answer)).
An answer writes every figure with one decimal mark (`speaker.ts`): a sentence made elsewhere in
English is said in the language when it is a key's whole wording (a rule), else with the answer's
decimal mark in its figures. Any BCP-47 language is taken (`de`, `fr`, `pt-BR`, `zh`); a word that is no language tag is
refused by name. Spanish is loaded only when it is asked for (`loadLanguage`). English is the
default. A language with a decimal comma (Spanish) writes one unless the display's `decimal`
says otherwise. Lengths stay as the display states them, on the sheet too (in Spanish, a sheet in
feet and inches reads `8'-6" de alto` and its square metres `62,4 m²`); the check's figures stay in
metres.

## Words the plan keeps for a language

For a language Grid ships no file for, the plan keeps Grid's words itself, in
`display.words` (MSG-24, convention C32, [the plan file](plan-file.md#grids-words-in-another-language)):
a map from the language to a map from each key to its wording, with exactly the English key's
placeholders. A key is said from the plan's word for the language, else from the language's
file (Spanish), else in English. `packages/floorplan/src/messages/words.ts` reads and checks them
and hands one plan's words to `say` (`setPlanWords`, done by `languageFor` for every command and
tool call that reads a plan).

The agent, who speaks the person's language, writes them with `grid_words`
(`packages/cli/src/mcp/wordsTool.ts`):

1. `grid_words` with `language` and `output` (`drawing`, `sheet`, `check` or `describe`) makes that
   output for this plan and lists only the keys it prints (`listenForKeys` records the keys said
   in the language while it is made), each with its English, its placeholders and its word now.
2. The agent translates them and sends them back as `words`. Every word is checked: a key Grid
   does not have, a placeholder that differs from the English key's, a line break, or a word
   that reads as a pass or an approval (`approvalWords`) is refused by name, and none is written.
3. Every output prints them from then on. `plan_language: true` makes the language the plan's own.

When a tool's answer printed some of Grid's words in a language with no word for them, it says so
in one line at its end, with how many, and that `grid_words` gives them. The words are the
agent's, not a reviewed translation: they are the person's plan's, like its room names.

- The decimal mark is the display's `decimal`, never the words': a language Grid ships no file
  for writes a point unless the display says comma.
- English is the source and is never replaced; a plan's words for `en` are left out.
- A region is its language: words for `pt` serve `pt-BR` and `pt-PT` alike.
- A room's use, on a room the person did not name, is labelled in English in such a language;
  the floor a plan with no floor list stands on is named by the plan's word for `floor.ground`.

## Words of the person's language

- The floor a plan with no floor list stands on is named in the language Grid writes in
  (`GROUND_FLOOR_NAME` in `languages.ts`): "Ground floor", "Planta baja". A floor the plan names
  keeps its own name. A command or a tool asked for a language reads the plan through `spokenIn`
  (`geometry/floors.ts`), so the name follows the language asked for too (MSG-22). In the check's
  record it is the one value that differs by language, since it is Grid's own word.
- A language with a region, `es-MX` or `es-ES`, is its language (`readLanguage`), on the command
  line, in a tool's `language` and in the plan's `display.language`.
- A room's use may be written in the person's own words, in Spanish, German, French or Chinese
  (`USE_WORDS_BY_LANGUAGE` in `uses.ts`), and is read as the use wherever a use is given. Each word
  means one use and nothing else; a word that means two things (`sala`, `entrée`) is left out.
  These words are Grid's own choice, not reviewed by a speaker of each language.
- An id is plain letters, digits, `-`, `_` and `.`: rooms text takes the accents off one, and a
  tool reads an id given with accents the same way (`plainId` in `types/planText.ts`). One rule,
  `readPlainId`, checks an id in rooms text, every tool argument and every option (CMD-24).

## Adding or changing a sentence

1. Add the key to `en.ts`, with its placeholders, in plain English. Never anything that reads as
   "this plan complies" (MSG-3).
2. Add the same key, with the same placeholders, to every other language's file. A test fails
   when the files have different keys or a key different placeholders. When you cannot write the
   language, write the English there and say so in the change: the reviewer of that language
   will see it.
3. Say it from the code with `say` (or `said` for a part of another sentence). A test fails on an
   English sentence written anywhere else in the user-facing sources.

## Where words may be written

A sentence Grid writes for a person is a key of the message files and nowhere else.
`packages/cli/src/__tests__/ownWords.test.ts` reads every user-facing source of the four
packages and counts the string literals that look like an English sentence. A file not on its
list must have none, and a listed file must have exactly its count: a new sentence fails it, and
a moved one asks for its count to come down. The list says why each file still holds English:
agent-facing text (tool descriptions, English by design), the command line's help and refusals,
texts for people who build Grid, and what is shown to the person and not moved yet.

A record (`inspectPlan`) and a report keep every code, kind, id, figure and value the same in
every language: only the words change. Each line's `values` holds the figures, names, ids and
places its words were made with, so an agent can retell a line in any language from its code.

## Adding a language

A language most people never need is better written by the agent into each plan (above). Ship
a file only for a language Grid supports and a named person will review:

1. Copy `en.ts` to the new file, translate every value, and keep every key and placeholder.
2. Add the language to `LANGUAGES` in `languages.ts`, with its status `draft translation, not
   reviewed` and its decimal mark, and its labels to `USE_LABELS`.
3. Add its forbidden words to `approvalWords` (`packages/rules/src/result/approvalWords.ts`):
   the words that would make a line read as a pass or as approval in that language.
4. Never copy text from a standard, a code or a regulation into the file, in any language.

## Who checks a language

A language is marked reviewed only when a named person has read every line of it: an architect
for the building terms and for the label "General guidance, not your local rules". Until then
its status stays `draft translation, not reviewed`, in the file and here. An AI is never
recorded as a language's reviewer.

| Language | File | Status |
|---|---|---|
| English | `en.ts` | source |
| Spanish | `es.ts` | draft translation, not reviewed |

## Spanish terms

The words the Spanish file uses for Grid's parts, one each, so a reviewer checks each once.
Draft, not reviewed.

| English | Spanish |
|---|---|
| General guidance, not your local rules | Orientación general, no sus normas locales |
| the plan | el plano |
| floor (storey) | planta |
| floor (surface) | suelo |
| wall | muro |
| dividing line, virtual wall | línea divisoria, muro virtual |
| room | estancia |
| opening | hueco |
| door / window | puerta / ventana |
| leaf, swing, hinge side | hoja, sentido de apertura, lado de giro |
| sill | antepecho |
| offset (along the wall) | posición |
| fixture | aparato |
| stair / lift | escalera / ascensor |
| way out | salida |
| escape opening | hueco de evacuación |
| check | comprobación |
| figure (from a code) | valor |
| finding | hallazgo |
| worth a look | conviene revisar |
| left out | excluido |
| refused | rechazado |
| not checked | no comprobado |
| to confirm | por confirmar |
| net area | superficie útil |
| site | emplazamiento |
| plot | parcela |
| boundary (of the plot) | linde |
| edge (of the boundary) | tramo |
| set-back | retranqueo |
| plot coverage | ocupación de la parcela |
| fence, gate, path, paved area, pool | valla, cancela, camino, zona pavimentada, piscina |
| section | sección |
| slab | forjado |
| eaves | alero |
| hatched (on a drawing) | rayado |
| ground (in a section) | terreno |
| mono-pitch, gable, hip roof | cubierta de una vertiente, a dos aguas, a cuatro aguas |
| accessible | accesible |
| route | recorrido |
| the brief | el programa de necesidades |
| a named person | una persona con nombre |
| the work (a refurbishment) | la obra |
| existing, to be demolished, new | existente, a demoler, nuevo; as a phase: existente, de demolición, de obra nueva |
| fit-out (on a base plan) | acondicionamiento |
| the walk-through | el recorrido |
| square feet | pies² |
| line up (a floor over the one below) | estar alineada |
| reach past, sit back from (the floor below) | sobresalir, quedar retranqueada |
| moved (a stair room or a lift shaft) | desplazada |
| doorless opening | hueco sin puerta |

## Later steps

- Right-to-left languages need the drawings, sheets and reports laid out right to left.
- Chinese, Japanese and Korean need fonts with their characters in the sheet and the drawings.
- Languages with more plural forms than one and many need the plural rules of that language.
