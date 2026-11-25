# ARE-26: name the fixtures a measure leaves out

## Outcome

A measure that depends on fixtures (the turning circle and free floor of `grid_measure what=use`,
`what=fit`, `what=route` with a width, `what=access`, and the free floor in `grid_areas`) says in
its own answer which fixtures it left out and why. A toilet whose height is missing no longer
reads as "the room holds no fixtures" with a clear 2.20 m turning circle and nothing else: the
answer says `"wc" was left out (its height is missing), so its floor is not taken off`, and the
data carries the same list (`fixturesLeftOut`: id and reason). Before, only `grid_check` said so.

## Design

- `packages/cli/src/quantities/fixtures.ts`: `fixturesLeftOut(plan, faults)` joins the items the
  reader set aside (`part-left-out`, with the field and what was found) and the items the
  checks hold back (`planFixtures().leftOut`), each with a reason; `fixturesLeftOutLine` says it
  once, in Grid's words (`measure.fixturesLeftOut` in `messages/`, English and Spanish).
- `packages/cli/src/mcp/readTools.ts`: the measures above add the line and `fixturesLeftOut` to
  their answer. `quantities/use.ts` no longer says "the room holds no fixtures" when some were
  left out: it says none could be measured.
- Decision: a fixture with no height is still left out, not measured at a made-up height. The
  schema needs a positive height (C6), and giving an item an unstated height is a change of the
  plan's schema, which is outside this card. What changes is that the answer says so.
- Decision: the accessible flag on a toilet needs a new field in the plan, so it is left for a
  convention of its own.
- No new convention, no new message code.

## Done

- Tests that fail before: a toilet without a height in a bathroom; `what=use`, `what=fit`,
  `what=access` and `grid_areas` each name it and its reason, the data lists it, and a plan with
  no left-out fixture answers as before.
- `changes/ARE-26.md`; typecheck, lint, the cli and floorplan test folders, ownWords, scoreboard.
