# CMD-48: a command for every reading tool

## Outcome

Someone working in a shell, a script or CI can ask the plan what an agent asks the tool server,
with the same answer. Today `grid areas`, `grid takeoff` and the other reading tools answer
"There is no command", so a script has to start the tool server and speak its protocol to get a
room schedule or a door count, and nothing can fail a build on what a plan holds. After this
change:

- `grid areas`, `grid schedule`, `grid takeoff`, `grid measure`, `grid count`, `grid find`,
  `grid fields`, `grid compare` and `grid brief` run `grid_areas`, `grid_schedule`,
  `grid_takeoff`, `grid_measure`, `grid_count`, `grid_find`, `grid_fields`, `grid_compare` and
  `grid_write_brief` (reading only: the brief is read, never written), with the tool's own
  arguments as options, dashes for underscores, as `grid edit` does for the change tools.
- Without options of its own a command prints the tool's text. `--json` prints exactly the tool's
  structured answer, the same record `structuredContent` carries on the tool server (label,
  figures as the text writes them, the plan's revision), never shortened to the server's size.
- `--csv` prints a table where the answer is one: the tool's own CSV for areas, schedule and
  takeoff (the same as `--format csv`), and the rows for `find` and the groups for `count`.
- `--fail-on <condition>` makes the command exit 3 when the answer holds that condition, after
  printing it, so CI can stop on it: a door narrower than a figure (`grid find ... --fail-on
  found`, `grid measure narrow --under 0.8 --fail-on short`), a figure not proven
  (`grid areas --fail-on unproven`), a brief line missed (`grid brief --fail-on missed`), plans
  that differ (`grid compare --fail-on differs`). `grid check` takes `--fail-on problems` and
  `--fail-on notes` (notes not set aside as seen), so a plan with a door that leads nowhere can
  fail a build; its exit is otherwise as before.

## Design

All in `packages/cli/src/command/` and `docs/commands.md`.

- `read.ts` (new): one table of the reading commands, each with the tool it runs, the arguments
  the command line gives in its own way (the plan file as the one positional; for `compare` the
  plans as positionals; for `measure` what to measure as its first word or `--what`), whether it
  writes CSV and its `--fail-on` conditions, each a test of the tool's structured answer. Options
  come from the tool's argument list (`edit.ts`'s way: `verbOptions`, `valueOf` and the yes-or-no
  words are shared with it, moved into an exported helper there), so a new argument on a tool
  (such as a new `what` of `grid_measure`) is an option at once and the help is the tool's.
- The answer comes from `serverTool(tool, { project }).call(...)` with `whole: true`: the same
  path the tool server answers by, so text and data cannot differ from it. A tool refusal is
  exit 1 in one line, with the tool's argument names spelt as options; a bad option exit 2.
- `--fail-on` exits 3, a code of its own, so a script tells "the plan holds what you asked to
  stop on" apart from "the plan or a path was refused" (1) and "the command line was refused"
  (2). The condition is refused by name, with the ones the command takes, before anything runs.
  `grid measure --fail-on short` holds for `fit` (does not fit), `narrow` (anything narrower),
  `route` (no way found, or the width does not get through) and `use` (an indicator under its
  figure); other measures are refused with that list.
- CSV for find and count is written with `quantities/units.ts`'s `csv`, so its first row is the
  label as every Grid CSV's is.
- `main.ts`: the commands in its table and help, dispatched to `read.ts`; `check` takes
  `--fail-on`.
- `grid check --json` keeps its shape: changing it to `grid_check`'s would break scripts written
  against it. That is left for a person to decide (see the change's note).

## Done

- `command/__tests__/read.test.ts`: each command's `--json` equals the tool server's
  `structuredContent` for the same call; `--csv` for areas, schedule, find and count; each
  `--fail-on` condition exits 3 when it holds and 0 when not; an unknown condition, `--csv` where
  there is no table and `--csv` with `--json` are refused with exit 2; a tool refusal is exit 1
  with options named as the command line spells them; `grid check --fail-on problems` exits 3 on
  a plan with a door that leads nowhere.
- `npm run build`, `npm run typecheck`, `npm run lint`, the CLI package's tests,
  `ownWords.test.ts` and `npm run scoreboard` (no count worse).
