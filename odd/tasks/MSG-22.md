# MSG-22: floor names, ids and use words in other languages

## Outcome

- A plan with one floor and no floor list, read in Spanish (its `display.language`, or `--lang es`
  and `language: "es"` asked of a command or a tool), names that floor "Planta baja" in every
  report, description, drawing and sheet; in English it stays "Ground floor". A floor the plan
  names keeps its own name.
- An id written in rooms text with accents (`baño`, `salón`, `küche`, `straße`) is written in plain
  letters (`bano`, `salon`, `kuche`, `strasse`), everywhere the text names it, and the answer says
  which ids were changed (`rooms/id-folded`). An id that has letters with no plain form (`客厅`) is
  refused where it is written (`rooms/bad-id`), with what an id may hold, instead of being written
  and then refused by every tool. A tool given an id with accents reads it in plain letters, so
  `baño` reaches the room rooms text wrote as `bano`.
- A room's use may be written in plain words of a few more languages, and is read as the use:
  Spanish (`cocineta`, `lavandería`, `recámara`, `bodega`), German (`Küche`, `Bad`, `Flur`,
  `Schlafzimmer`, `Wohnzimmer`), French (`cuisine`, `chambre`, `salle de bains`, `couloir`) and
  Chinese (`客厅`, `卧室`, `卫生间`, `厨房`). The same words are read wherever a use is given: the
  plan file, rooms text, the edits (`grid_rename_room`, `grid_merge_rooms`, `grid_split_room`,
  `grid_add_room` and `grid edit … --use`) and the brief.
- A language asked with a region (`es-ES`, `es-MX`) is Spanish in every tool argument and in the
  plan's `display.language`, as it already was on the command line.
- The Spanish file stays a draft translation, not reviewed: nothing here says otherwise.

## Design

- `messages/languages.ts`: `GROUND_FLOOR_NAME`, the default floor's name per language.
- `geometry/floors.ts`: `planFloors` names the floor no list names by the plan's
  `display.language` (`groundFloor`). `spokenIn(plan, language)` gives the plan as read in the
  language asked for, for a plan whose ground floor has no name of its own: the commands and tools
  that write in a language read the plan through it, and `inspectPlan` does for its record.
  Chosen over passing a language to all seventy-odd callers of `planFloors`, or a module-wide
  language, which async commands cannot scope.
- `messages/uses.ts`: `OTHER_USE_WORDS`, plain words per language that mean one use, folded as
  labels are; `foldLabel` keeps letters of any script so Chinese words are not folded to nothing.
  `roomUseOfLabel` reads them after the labels. Words that mean two things (`sala`, `Kind`,
  `séjour`?) are left out, as `hall` is. A word that is the use's own name in a language
  (`Schlafzimmer`, `卧室`, `chambre`) is read as `bedroom`, `living` or `dining` as the Spanish
  labels are: the author chose that use in their language.
- `types/floorplan.ts`: `display.language` read through `readLanguage`, so `es-MX` is `es`.
- `rooms/words.ts`: `plainId` folds an id to plain letters; `compile.ts` folds every unquoted word
  of a line once, where words are read (a small change, as asked), collects the ids it changed
  and warns; at the end an id that is still not plain is refused.
- CLI: `mcp/toolkit.ts` reads an id argument through `plainId`; a `use` argument (`USE_ARG`) takes
  any word and is read through `readUse`, refused with the list when it is not a use. The edits'
  tools and `grid edit` are made from those arguments; the brief reads its uses the same way.
  `LANGUAGE_ARG` takes a region tag.

## Done

- Tests: floors (`planFloors` in Spanish, a named floor kept), `spokenIn`; uses (each language's
  words, Chinese kept by the fold); rooms text (`baño` folded and warned, referenced by its folded
  id; `客厅` refused); toolkit (an accented id read plain, a Spanish use read, `es-MX`); the
  rename edit with `cocina`; the brief with `cocina`; `grid describe --lang es` on a one-floor plan.
- `npm run typecheck`, `npm run lint`, the floorplan, rules and cli test folders, `ownWords`,
  `tolerances`, the contract test and `npm run scoreboard`.
