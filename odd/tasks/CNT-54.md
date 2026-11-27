# CNT-54 Build phases as a field

## Outcome

An agent can find and count walls, rooms and openings by build phase and pass the result to a
plan view to highlight parts or colour each phase. A 3D view and a facade distinguish new work.

## Design

Use the existing phase reading for both `phase` and `stage`. Include demolition in phase
queries and phase colouring so the drawing and the answers can refer to the same parts.
Keep area measurements based on the building after the work. Use a shared colour for new
work in the 3D scene and the working facade, and retain the technical facade's monochrome.

## Done

Cover field discovery, phase filters and groups, inherited opening phases, plan highlights,
facade fills and 3D materials. Run the build, type check, lint, tests for affected folders,
the tolerances check and the scoreboard.
