# VEW-14: grid_view draws the parts to be demolished, as grid draw does

## Outcome

On a plan whose parts are marked existing, demolished and new, `grid_view kind=plan` draws what
`grid draw` draws: the walls, doors and windows to be demolished dashed, a "to be demolished"
entry in the key, and the text says how many parts are to be demolished, the same count
`grid_check` gives. `highlight` takes the id of a part to be demolished. An agent that has only
the tool server can show an architect a demolition.

## Design

- Cause: `grid_view` drew from `survey.plan`, which is the plan as it stands after the work
  (`planInState(…, 'after')`, CNT-10), so every demolished part was gone before the viewer saw it.
  `grid draw` draws the plan as stated. The viewer already draws both states with their phases.
- `grid_view kind=plan` now draws the plan as stated (`loaded.plan`). Measures, checks and
  camera work stay on the survey's after-the-work reading, as everything that measures does.
- `highlight` (and the boxes of the picture) read their ids from the plan as stated, so a
  demolished wall, door or window can be picked out; colour by a field is still read on the
  building after the work.
- The text gains one line on a plan with phases: how many walls, doors and windows are drawn
  as to be demolished, counted by the same function `grid_check` uses for its count.
- Decision: 3D, facade and section pictures are left as they are; the card is about the plan.

## Done

- `packages/cli/src/mcp/__tests__/phases.test.ts`: on the refurbishment plan, `grid_view kind=plan`
  has the demolished wall and openings among its boxes, says how many are to be demolished and
  that the number equals `grid_check`'s, takes a demolished id in `highlight`, and a plan with no
  phases is answered as before.
- typecheck, lint, the cli and viewer test folders, scoreboard.
