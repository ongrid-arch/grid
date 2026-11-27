# Several rooms, a flat, a group of rooms or every floor in one view

## Outcome

- `grid_view kind=plan floor=all` draws every floor of the plan in one picture, side by side,
  lowest on the left, all at one scale and each under its name. Every floor is framed to the
  same part of the plan, so a stair or a shaft lines up from one floor to the next. An agent
  asked to show all the floors sends one call, not one per floor.
- `crop` frames more than one part: several ids or room names joined by commas, a flat by its
  id or name, or the rooms that meet a condition on a fact or field (`household = Rose`,
  `department = Sales`), as `grid_find` writes them. A zone is a room, so its id crops to it.
- `crop_box` frames a box of the plan, `{ from: [x, y], to: [x, y] }` in metres.
- `margin` sets the space kept round what is cropped, in metres. A crop keeps 0.5 m round its
  parts when none is given, so a room is no longer drawn edge to edge; a box keeps none.
- With no floor named, a crop whose parts are not on the lowest floor is drawn on the first
  floor that holds them all, so one household upstairs is one call.
- The answer says what was framed: the parts, the flat, the condition and how many rooms meet
  it, or the box, and the margin.

## Design

- `packages/cli/src/mcp/readTools.ts` (`grid_view`): the floor argument reads `all` (unless a
  floor of the plan has that id) before `floorArg`; only `kind=plan` takes it, with `look` and
  `dimensions`, and every other plan argument is refused by name with it. `cropPart` becomes
  `cropParts`: one term (an id, a room's name, a flat's id or name, a condition), else the
  terms between commas, each found on the floor; with no floor named the floors are tried in
  order. A condition is read by `readCondition` from `quantities/query.ts`, and matched on the
  floor's rooms only.
- `packages/cli/src/draw/partBoxes.ts`: `cropFrame` takes several parts and a margin; the
  frame is their joined box, at least 2 m each way as before, and the margin round it.
- `packages/cli/src/draw/views.ts`: `sheetView` takes a frame and whether to draw sizes for each
  drawing, so the floors side by side are drawn by the sheet that already puts plans side by
  side at one scale. The frame shared by every floor is the joined `pictureFrame` of each.
- No geometry is computed outside the core and the viewer; the viewer is unchanged.
- Decisions: `floor=all` returns no part boxes (a box would need its floor; the boxes stay for
  one floor), and no SVG (the sheet is drawn as a PNG). Crop stays one string so every call that
  sends one id still works; a box is its own argument because it is an object.

## Done

- `packages/cli/src/mcp/__tests__/cropView.test.ts`: a crop of two ids frames both; a flat
  frames its rooms; a condition on a fact frames the rooms that meet it; a box frames the box; a
  margin widens the frame; a crop of a room upstairs with no floor named draws that floor; the
  refusals (crop with crop_box, a box of no size, a term that names nothing).
- `packages/cli/src/mcp/__tests__/allFloors.test.ts`: `floor=all` on a plan of two floors gives
  one picture wider than either floor's, at one scale, the text naming both floors in order;
  stray arguments with it and `floor=all` for a 3d view are refused.
- `npm run build`, `typecheck`, `lint`, vitest on `packages/cli/src/mcp`,
  `packages/cli/src/draw`, `ownWords` and `npm run scoreboard` exit 0.
