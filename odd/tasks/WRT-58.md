# WRT-58: the edit tools say which use they read a word as

## Outcome
An agent or person who gives an edit a use word rooms text reads (`gym`, `cocina`, `WC`) gets that
use, and the answer says which use the word was read as: `Read "gym" as the use sport.` A word that
already is a use, in any capitals, says nothing. A word that means no use is still refused, naming
the uses.

## Design
- The tool arguments already read a use word through `readUse` (the same reading as rooms text).
  `packages/cli/src/mcp/toolkit.ts` now records each word read as a different use against the call's
  arguments (`usesRead`).
- `writeChange` (`packages/cli/src/mcp/writeTools.ts`) puts one line per such word after the
  change's own lines, through the new message `edit.use.read` (English, and a draft Spanish line).
  Every edit that takes a use (rename, merge, split, add room) gets it from this one place; the
  `grid edit` verbs run the same tools.
- Decision: only text carries the line, not the answer's data, so no output schema changes.

## Done
- `packages/cli/src/edit/__tests__/useWords.test.ts`: gym is read as sport and said; `sport` and
  `Sport` say nothing; an unknown word is refused.
- Own words, tolerances, the rules contract and the CLI and floorplan test folders pass.
