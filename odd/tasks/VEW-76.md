# A simple look for pictures a person sees, and a large-print form

## Outcome

- `grid_view kind=plan look=simple` draws a floor for a person who is not a draughtsperson: a
  buyer, a family, a client. Each room is filled by its use, an outdoor space keeps its own green
  (never a grey box), and each room's label gives its name, its width × depth and its area, in
  two units: the plan's own first (metres, or feet and inches) and the other after it. Only the
  overall size along each side is drawn: no chains of dimensions and no room size lines. Under
  the drawing come the plan's title or the site's name and address, and the floor's total area
  with the rule it follows (the rooms' floor added up, inside the walls), in both units. The
  north arrow and the fixtures' symbols are drawn as in the working look. None of grid_check's
  notes, door warnings or dashed outlines of the floor above are on it.
- `look=large` is the large-print form for someone who reads small print badly: room names twice
  as large where they fit (one and a half times, then the usual size, where they do not), the
  area under each, the same colours, title and total, and no dimensions at all.
- The tool's description says to use `simple` for a picture to show a person and keep
  `working` for checking the drawing, so agents stop handing people the working drawing with
  three dimension chains a side and check notes.
- A room's sizes come from the plan as it is now, so nobody writes "4.2 × 3.6" into a room's
  name to get them on a picture (that goes stale on the first edit and leaks into every export).

## Design

- `packages/viewer/src/picture/look.ts`: two more named looks, `simple` and `large`, the working
  look's colours and lines with a new optional field `forPeople` (`{ large }`). A look stays a
  named set of values `planPicture` applies to the same geometry; `fileLook` keeps both (light
  paper), so `grid draw --look simple` works too.
- `packages/viewer/src/picture/planSvg.ts`: with a look for people, `planPicture` builds the
  overall dimensions only (`buildDimensions` with no chains and no room sizes; none for `large`),
  marks and lists no faults, turns off the door warnings and the floor above, colours by use
  unless the call asks otherwise, sets the label style (sizes, the second unit, large) and adds
  the total line to the band under the drawing. The total is the floor's net figure from the
  core's `planAreaFigures` and its rule is named in Grid's words from the message files.
- `packages/viewer/src/canvas2d/labelPlacement.ts`: a label may carry more lines under its area
  (`LabelRoom.more`): its forms with them come first, then the forms without, so a small room
  still gets its name. A large label room tries forms at twice and one and a half times the size
  first.
- `packages/viewer/src/picture/scene.ts`: the room's width × depth read from the core's
  `roomDimensions` (a rectangle's `-width` and `-depth`; a room of another shape gets its area
  only), written in the drawing's display and in the other unit; an outdoor room keeps its fill
  when the look is for people.
- `packages/cli/src/draw/viewNames.ts`, `views.ts`, `mcp/readTools.ts`: `simple` and `large` in
  the look list; a facade, a section and the floors side by side draw them as `working`, and the
  answer says so. The answer for a plan says what the look shows and which units.
- Words in `packages/floorplan/src/messages/en.ts` and `es.ts` (draft), keys `drawing.total.*`.
- Decisions: the total is the net area (it is what the room labels add up to, so a person can
  check it); a plan with no north stated gets no arrow (Grid does not invent one) and the answer
  says so; the key of use colours stays, so the colours mean something. The garden stays green
  by keeping an outdoor room's own fill in these looks rather than changing `colour=use` for
  every look.

## Done

- `packages/viewer/src/picture/__tests__/forPeople.test.ts`: in `simple` a rectangular room's
  label holds "W × D m" and its feet-and-inches size, its area in m² and sq ft; only overall
  dimensions are drawn; faults given are neither marked nor listed; rooms are tinted by use and
  an outdoor room keeps its green; the band holds the title and the total with its rule. In
  `large` there are no dimensions and a room name is drawn larger than 13 px. A plan in feet
  gives feet first. Fails before: `simple` is not a look.
- `packages/cli/src/mcp/__tests__/simpleLook.test.ts`: `grid_view look=simple` and `look=large`
  answer with a picture and say what they show; the description recommends `simple` for a person.
- `npm run build`, `typecheck`, `lint`, vitest on each folder holding a changed file,
  `ownWords.test.ts` and `npm run scoreboard` exit 0.
