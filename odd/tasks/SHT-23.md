# SHT-23: sections and elevations on the client and check sheets

## Outcome

A person who asks for the building's sheet gets more than plans. `grid sheet` and `grid_sheet`,
in the client and the check layout, follow the floor pages with:

- an elevations page: every side of the building (north, east, south, west, as the drawing
  names them), all drawn at one true scale on the A3 page;
- a sections page: two sections, A along the building and B across it, at the same scale;
- each titled, with a scale bar and a title block (project, drawing, scale, date, status), and
  the label in the footer as on every page;
- the section lines A and B marked on every floor's plan, so the plan and the section say the
  same.

An agent no longer crops pictures or shows a facade in chat to give the person a set: the PDF
holds it, and the answer's page list names the new pages.

## Design

- `packages/cli/src/sheet/sideDrawings.ts` (new, pure): chooses the two section lines from the
  plan (through the largest room of the lowest floor, moved off any wall that runs along the
  line, from one side of the building to the other with a metre to spare), and lays out a page of
  facades or sections: the largest usual scale (1:50, 1:100, 1:200, 1:250, 1:500, 1:1000) at
  which every drawing of both pages fits its cell of the drawing box, one scale for both pages,
  and each drawing's place and size in pixels. A pixel is one size on the page, so the words of
  every drawing print alike. The facades and sections are the viewer's own pictures
  (`facadePicture`, `sectionPicture`); nothing is worked out here but where they go.
- `packages/viewer/src/picture/facade.ts` and `section.ts`: export what each picture frames in
  metres at a given metres per pixel (`facadeFraming`, `sectionFraming`), so the sheet can size
  each picture to its scale. Nothing they draw changes.
- `packages/floorplan/src/geometry/drawingMarks.ts` and the viewer's `drawingMarks.ts`: a plan
  picture may be asked for more than one section mark, each with its own name
  (`DrawingMarksAsked.sections`); the one `section` named A stays as it is.
- `pages.ts`: a new picture kind, `drawings`, and two page kinds, `elevations` and `sections`,
  after the floor pages on both layouts (before the client's area schedule and the check's
  schedules). The floor pages' plans carry the section marks. A plan with no walls gets neither
  page; a section that misses the building is left out.
- `pdf.ts`: draws a drawings page: each picture as a PNG at its place, at the page's one scale,
  then a scale bar, the notes and the title block under the box.
- Words: in `messages/en.ts` (and the draft `es.ts`), never in the sheet's code.
- `grid_sheet`'s description and `docs/commands.md` say what the two layouts now hold.

Decisions: Grid chooses the section lines, because the plan file has no place for them and
adding one is a new convention (left to a person). Elevation marks are not drawn on the sheet's
plans: they stand outside the dimensions, beyond the frame the floor pages share. The floor pages
keep their own zoom (they are not at a stated scale); only the new pages are.

## Done

- `sheet/__tests__/sideDrawings.test.ts`: the section lines cross the building and run off its
  walls; every facade and section on the pages is at one scale and inside its cell; a plan with
  no walls has no such page.
- `pages.test.ts`: the client and check layouts list `elevations` and `sections` after the
  floors; the floor pages' pictures ask for the section marks; the titles and the title block.
- `pdf.test.ts`: the PDF has a page for each, and its text holds the titles, the scale and the
  title block.
- The viewer's marks test: two section marks, each with its name.
- `npm run typecheck`, `npm run lint`, the cli, viewer and floorplan tests, ownWords and the
  contract test, and `npm run scoreboard` (no count worse).
