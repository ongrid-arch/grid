# CMD-36: take the plan the same way in every command

## Outcome
`grid mark` takes the plan the way `check`, `diff` and `draw` do: `grid mark opt.json` and
`grid mark start opt.json` mark that plan. `--plan` stays as an alias. Naming the plan twice,
or two marker names, is refused by what was given.

## Design
- `packages/cli/src/command/main.ts`: in `mark`, a positional ending in `.json` is the plan;
  any other is the marker name. The old refusal of a `.json` name goes: it is the plan now.
- `write` keeps `--plan` only: its one positional is the rooms text, so the plan cannot be one.
  `edit`, `check`, `describe`, `draw`, `export`, `sheet`, `tidy` and `diff` already take it positional.
- `diff.ts` option help and the usage line and `docs/commands.md` say so.

## Done
- A test in `packages/cli/src/versions/__tests__/diff.test.ts` marks and diffs a plan in a
  subfolder by positional, by `--plan`, and refuses two plans or two names.
