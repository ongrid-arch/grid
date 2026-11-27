# MSG-35 · Find the travel distance to an exit

## Outcome

An agent asked for the walking distance to the nearest exit during an escape or evacuation
can find `grid_measure` and make the route call from its description.

## Design

Name travel distance, walking distance, escape, evacuation and nearest exit near the start of
`grid_measure`'s description in `packages/cli/src/mcp/readTools.ts`. Give a copyable `what=route`
call with a starting room and `to=outside`. Use the existing route documentation in
`docs/tool-server.md` to explain where the chosen exit and measured distance appear in the answer.

## Done

A `tools/list` test checks the search terms and the example arguments. Run that test before and
after the wording change, then run the affected tests, build, type check, lint and scoreboard.
