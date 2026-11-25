# VEW-38: a section line that misses the building, or ends inside it, says so

## Outcome

- A section line that crosses no part of the building is no longer a silent empty picture. The
  section carries `reach.missesBuilding`, the picture's key and `grid draw --section`'s note say
  it in words ("the line cuts nothing of the building; draw it across the walls"), and
  `grid_view kind=section` repeats it.
- A section line whose first or last point stands inside a floor's outline is drawn with a break
  line (a zigzag) at that end, and a note says the cut stops inside the building there, so the
  slab ends and the ground line are read as cut off, not as the building's own ends.
- Nothing is refused: the command still exits 0 and the picture is still written. A cut that
  starts or ends outside the building is unchanged.

## Design

- `packages/floorplan/src/geometry/section.ts`: `PlanSection.reach` =
  `{ missesBuilding, startInside, endInside }`. Inside is `inPieces` of any floor's outline
  (the outlines the ground already uses); misses is "no part cut". Section geometry is not
  changed.
- `packages/floorplan/src/messages/{en,es}.ts`: `drawing.section.reach.misses`,
  `drawing.section.reach.startInside`, `drawing.section.reach.endInside`, and a
  `drawing.section.note.reach` sentence for the command's note.
- `packages/viewer/src/picture/section.ts`: draws a zigzag break line (`data-part="section-break"`)
  at each end that is inside, and lists the reach sentences in the key.
- `packages/cli/src/draw/drawSection.ts` (`sectionNote`) and `src/mcp/sectionAnswer.ts` say them
  on standard error and in the tool answer.
- Decision: a warning, not a refusal, because an empty or half section is still a valid file and
  scripts may rely on exit 0. Easy to turn into a refusal later.

## Done

- Core tests: a line across empty ground misses; a line through the building does not; a line
  ending in a room is `endInside`; one running past both walls is neither.
- Viewer tests: the break line is drawn only at an inside end; the key carries the words.
- CLI tests: the note and the tool answer carry the sentences.
- Typecheck, lint, the three packages' tests, ownWords, tolerances, scoreboard.
