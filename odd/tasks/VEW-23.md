# VEW-23: a glazed wall type is cut as glass in a frame

## Outcome
A wall whose type is glazed (a curtain wall, a glazed partition) is cut in a section as glass in a
frame, never as solid poche. The precast wall beside it stays solid. An agent reading the section
gets the glazed walls apart from the solid cut (`glass`), each flagged on its part.

## Design
- `packages/floorplan/src/geometry/section.ts`: a wall part reads `wallTypeOf(plan, wall)?.glazed`
  and carries `glazed: true`. `cut` (the joined solid shapes) is made of the parts that are not
  glazed; `PlanSection.glass` lists the glazed wall parts, rectangle by rectangle. Their rectangles
  stay in `parts` and in the bounds, so the drawing still frames them.
- `packages/viewer/src/picture/section.ts`: each glass rectangle is drawn paper-filled inside a
  frame outline (the wall outline pen), a glass line along its long axis, and a mullion at each
  cut edge (the frame's short sides) so a run of rectangles reads as panes between mullions.
  The viewer computes nothing: it draws the rectangles the core gives it.
- Decision: no new tolerance or convention; mullions are at the cut's own edges (where openings or
  joints cut the wall), not at an invented spacing, because the plan states none.

## Done
- core test: a glazed type wall leaves `cut` and is listed in `glass`; a solid wall beside it stays.
- viewer test: the picture has `section-glass` parts and no `section-cut` path over the glazed wall.
- changelog fragment `changes/VEW-23.md`; typecheck, lint, package tests, ownWords, scoreboard.
