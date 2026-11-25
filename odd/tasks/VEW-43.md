# VEW-43: describe counts outdoor rooms by kind

## Outcome

`grid describe`'s room summary, the bracket after the room count, counts balconies, terraces and
every other outdoor space by kind ("76 balconies"). A room written as outdoor no longer lands in
"N do not say what they are for": it says what it is, by its outdoor kind. Rooms with neither a
use nor an outdoor kind are still counted as before, and the line is left out when nothing is
unsaid (VEW-40).

## Design

- `packages/cli/src/describe/card.ts`, `usesText`: an outdoor room (`RoomFacts.outdoor`, already
  carried) is taken out of the unsaid count and counted under its kind, in the order of
  `OUTDOOR_KINDS`, after the bedrooms and bathrooms. The "none says" / "it does not say" forms
  compare against the rooms with no outdoor kind and no use, so a plan of only balconies reads
  "76 balconies", not "none says what it is for".
- Words: `describe.outdoor.<kind>.one` and `.many` per outdoor kind, in `en.ts` and `es.ts`, because
  plurals ("balconies", "light wells") are not "add s". The Spanish is a draft like the rest.
- Decision: an outdoor room that also states a use is counted by its use, as before the change; the
  kind only replaces the "unsaid" case. This is the smallest change and is easy to undo.

## Done

- `describe.test.ts` cases: balconies and a terrace counted by kind, not unsaid; a mixed plan keeps
  the unsaid count for rooms with neither; a plan of only outdoor rooms never says "none says".
- Spanish wording read through `language.test.ts`.
- ownWords, tolerances, messages tests and the cli describe folder pass.
