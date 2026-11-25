# CMD-24: one id rule for rooms text, every tool and every option

## Outcome

- An id is checked by one rule everywhere it is typed: rooms text, every tool argument (its
  schema and its check), `grid edit`, `grid diff --rooms`, a camera record sent back to
  `grid_view` and the preview's record. The rule is plain letters, digits, `-`, `_` and `.`, at
  most 64 characters, with accents taken off first (`baño` is `bano`), as rooms text already writes
  ids (MSG-22). An id one of them takes, all of them take.
- An id rooms text cannot write (`客厅`) is refused on its line with a plain id to write instead,
  made from what the part is (a room's use, `living`; a floor, `floor`; a door, `door`), and the
  name in quotes keeps the person's words.
- A plan whose file already holds such ids (written before rooms text refused them, or by hand)
  is read back as rooms text with plain ids in their place, every reference with them, and the
  names as written: `grid describe --as rooms` and `grid_describe as=rooms` say which id became
  which, and the text writes back over the plan it was read from. A tool refusing such an id says
  this is the way to give the plan plain ids, so no agent rewrites the plan file by hand.

## Design

- `packages/floorplan/src/types/planText.ts`: the one rule. `ID_PATTERN` (the schema's pattern),
  `PLAIN_ID`, and `readPlainId(text)`, the id in plain letters or null. `planIdText(text)` says
  whether a text is an id a plan file may hold (no unsafe character, at most 64), for records that
  send back the plan's own ids as the plan holds them.
- `packages/cli/src/mcp/toolkit.ts`: the argument check and the schema read the rule from there;
  the refusal of an id with letters that have no plain form points at the read-back.
- `packages/cli/src/command/diff.ts` (`--rooms`), `draw/cameraAsk.ts` and `preview/record.ts`:
  their own copies of the pattern give way to the rule. The camera and the preview record hold the
  plan's ids as the plan holds them, so they take any id a plan may hold.
- `packages/floorplan/src/rooms/ids.ts`: `plainIdFor` makes the plain id offered for a part, and
  `withPlainIds(plan)` gives the plan with every id that has no plain form replaced by one, in
  every place that names it (object keys too), names, labels, texts and facts left as written.
  The `rooms/bad-id` refusal names the plain id offered.
- `packages/cli/src/command/describe.ts`: the read-back as rooms reads the plan through
  `withPlainIds` and keeps the `based on` line of the plan as the file holds it, so writing the
  text back is a change of ids, not a refusal. Chosen over changing `rooms/read.ts`, which another
  change is working in.
- Not chosen: taking any letter of any script as an id. A schema pattern with `\p{L}` is not read
  by every client's validator, the 3D export writes node names in plain letters and would give two
  rooms the same name, and MSG-22 had just settled on plain ids with its own tests and pages.

## Done

- `packages/floorplan/src/rooms/__tests__/plainIds.test.ts`: the refusal offers a plain id from
  the use; `withPlainIds` renames every reference and keeps names; a plan with such ids reads back
  to text that writes with plain ids and the same rooms.
- `packages/floorplan/src/types/__tests__/`: `readPlainId` folds, refuses, limits.
- `packages/cli`: a tool and `grid diff --rooms` take `baño`; the toolkit schema pattern is the
  rule's; `grid describe --as rooms` of a plan holding `客厅` writes ids in plain letters and
  `grid write` writes it back.
- `npm run typecheck`, `npm run lint`, the floorplan and cli test folders, `ownWords.test.ts`,
  `tolerances.test.ts`, `npm run scoreboard`.
