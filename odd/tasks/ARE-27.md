# ARE-27: one clear-width rule for doors, per leaf

## Outcome

A door is judged the same way everywhere Grid sets it against a width: the brief's `door_width`,
`grid_measure what=access`, a firm's `door_clear_width` and the brief lines `grid check` now lists.
Each says what it measured. By default that is the clear width: the hole less what an open leaf
takes, leaf by leaf. A brief may say instead that its figure is for the `hole` or the `leaf`.

- Each leaf of a door has its own clear width. A pair whose plan states the leaf that opens
  (`opens`) is judged by that active leaf. A pair that states none opens both leaves, and each
  leaf takes its allowance.
- A single door whose `opens` part sits beside a fixed panel is judged by that part, not the
  whole hole.
- The allowance for an open leaf goes by the door's kind. A swinging leaf (no kind, `single`,
  `double`) and a folding door keep `useOpenLeaf`. A door that slides, slides into its wall, rolls
  up or lifts overhead (`sliding`, `pocket`, `roller`, `garage`) leaves its hole whole, so nothing
  is taken off. A 1.8 m roller door leaves 1.8 m clear.
- `grid check` and `grid_check` list the figures of the brief beside the plan that the drawing
  misses, under a heading of their own. They are the person's figures, never a code's.
- A firm figure's line carries the firm's own note on where the figure comes from, when the file
  gives one.

## Design

- `packages/floorplan/src/geometry/use.ts`: `doorwayClearance` works out the door's leaves (each
  leaf's place along the hole, width, allowance and clear width, and which one is active) and the
  width it is judged by (`judgedBy`: `hole` for a doorless opening, `leaf` for the active leaf, or
  `pair` for both leaves of a pair with no active leaf stated). `clear` stays the one clear width
  every caller reads, so CNT-13's `use/doorway-clear-width`, the firm's measure and the access
  measure change together. The allowance by kind is one function, `openLeafAllowance`, and reads
  the one limit `useOpenLeaf`. No new tolerance is added, so `docs/tolerances.md` keeps its table.
- `packages/cli/src/quantities/doorWidth.ts` (new): the one door width a person's figure is set
  against (`doorWidthFor`, by `clear`, `leaf` or `hole`), the word for it, and every door's
  clearance on a survey (`doorClearances`). `brief/lines.ts` and `quantities/access.ts` both read
  it, so the brief and the access measure cannot give two verdicts for the same door.
- `packages/cli/src/brief/brief.ts`: `door_width` takes `measure` (`clear`, `leaf` or `hole`),
  read into `FigureWish.door`, and `grid_write_brief`'s schema takes it. Left out, it is `clear`.
- `packages/cli/src/brief/answer.ts`: `briefMissedText` gives the brief's missed figure lines for a
  check. `command/main.ts` (`grid check`) and `mcp/readTools.ts` (`grid_check`) print them after
  the report. These are text lines, not new codes in the record: the brief is the person's, and
  the record's codes stay the drawing's, the codes' and the firm's.
- `packages/rules/src/result/firm.ts` and `inspect.ts`: a firm line's figure carries the
  standard's `note`. The `needed` words of each `firm/` code say it.

Decisions taken alone:

- A folding door keeps the swinging leaf's allowance. Its panels stack in the hole, which a
  bigger figure would need its own tolerance for. That is left for a later card.
- A `sliding` door is taken to slide clear of its hole along the wall's face. A slider that stacks
  behind a fixed panel is written with `opens` and is judged by that part.
- The brief keeps one `door_width` figure for every door. Figures by room are not added.

## Done

- `packages/floorplan/src/geometry/__tests__/doorLeaves.test.ts`: the leaves of a single, a pair
  with and without an active leaf, a part beside a fixed panel, and roller, garage, sliding and
  pocket doors that keep their whole hole.
- `packages/cli/src/brief/__tests__/doorWidth.test.ts`: the brief and the access measure give
  one verdict for the same door. A 1.0 m door against a 1.0 m figure is missed by both. A
  `measure: hole` figure is met by both, and each says which width it measured. A 1.8 m roller
  door meets a 1.8 m figure. A pair is listed leaf by leaf.
- `grid check` lists a missed brief figure (an e2e case in the same file through `runCli`).
- The firm line's `needed` says the firm's note.
- `npm run typecheck`, `npm run lint`, the floorplan, cli and rules tests, `ownWords.test.ts`,
  `contract.test.ts` and `npm run scoreboard`.
