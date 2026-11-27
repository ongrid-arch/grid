# Tolerances and limits

Read this when a check asks whether a size is meant, when you need the exact figure behind a
check, or when a survey needs looser tolerances.

Every check reads one table of tolerances and limits: `TOLERANCES` in
`packages/floorplan/src/geometry/tolerances.ts`, exported from `@ongrid/floorplan/geometry`.
Each figure in it is Grid's own, chosen for checking a drawing. None comes from a building code
or a standard, none cites a document, and none says what a building must be: a limit only
decides when Grid asks whether a size is meant.

A survey or a scan is less exact than a drawing. `validatePlan(plan, index, { tolerances })`, or
`withTolerances(changes, run)` around any other call, loosens the tolerances and limits for that
run, each to a positive number. The arithmetic guards (below a nanometre, what floating-point
numbers can tell apart) cannot be changed.

Every number in a plan must be finite: JSON reads a number too large to hold, such as `1e400`, as
infinity, and the schema refuses it. A coordinate or size past `largest` is refused with
`wall/too-large` or `opening/too-large`, and what rests on it is left out. No export ever holds
"Infinity" or "NaN".

Sizes far outside a building's are asked about as questions, never refused (warnings). A plan
whose typical wall height, thickness and door width read as a building in feet, inches,
centimetres or millimetres, and not in metres, gets one `plan/units-question` instead of a line
per wall. Otherwise a wall, an opening or a room past a limit gets `wall/size-question`,
`opening/size-question` or `room/size-question`, for example "Wall w1 is 27.00 m high, the
others on its floor typically 2.70 m: is that meant?". A door or a doorless opening onto a room
used as a stair or a lift lower than `stairDoorLowest` is asked about with the stair or lift it
opens onto (LVL-18). Where the plan says it is a home (a room
in it is used as a `bedroom` or a `living` room) the home figures apply. Where the plan, or a
floor of it, says it is a building of large halls (`building assembly`, `sport`, `industry` or
`warehouse`) the hall figures apply, the units question among them: a warehouse with 12 m walls
is not asked whether it was typed in feet.

| Entry | Kind | Value | What it decides |
|---|---|---|---|
| `openingOverrun` | tolerance | 0.001 m | How far an opening may run past either end of its wall, below the floor, above its wall or into the next opening, and still fit; also how far it may run into a wall that meets its wall (MSG-16), and how near a jamb the centre line of a wall that ends on its wall may meet it and be taken for that jamb (ARE-32). A refusal states the overrun and the offset that fits |
| `arcEnds` | tolerance | 0.005 m | How far a curved wall's end may lie from where its sweep takes its start, and its two ends differ in radius, and still be one arc (CNT-18); further, `wall/arc-ends-apart` names it |
| `arcSagitta` | tolerance | 0.001 m | How far the straight pieces a curved wall is traced, checked and drawn with may stand off its curve at their middle |
| `arcStep` | tolerance | 0.03 radian | The most a curved wall turns along one straight piece, so a small round room still measures within a few hundredths of a percent of its true area |
| `arcPiecesMost` | limit | 1000 count | The most straight pieces one curved wall is traced with; a longer curve is traced with this many, a little further off it |
| `polygonOnCircle` | tolerance | 0.02 m | How far each corner of a room drawn with straight walls may lie off one circle and still read as a curve written as a polygon, whose answer says how to write it as a circle |
| `polygonOnCircleCorners` | limit | 12 count | The fewest corners a room on one circle has before it reads as a curve written as a polygon, so a hexagon or octagon drawn on purpose does not |
| `smoothRunTurn` | tolerance | 5 degree | The most two walls meeting end to end may turn where they meet and still be one smooth run, which a door or window may cross (VEW-77); a sharper turn is a corner |
| `gap` | tolerance | 0.02 m | A wall reaches the wall it meets when its end is within half the thicker wall plus this. The spaces check lengthens every wall by this much at both ends; the wall faults name a gap or an overrun past it, and two walls on top of each other when their bodies overlap by more than this |
| `wallContact` | tolerance | 0.01 m | Slack past the walls' bodies when a room outline is traced: walls that touch, carry on in a row or reach a corner |
| `strayCorner` | tolerance | 1 m | A room corner further than this from both its walls is not a corner, and the wall list is out of order |
| `nearlyParallel` | tolerance | 0.2588 sine | Neighbouring walls closer to parallel than 15 degrees may be one straight side |
| `squareWithin` | tolerance | 0.0523 sine | When a scan is squared, a wall within about 3 degrees of a main direction of the plan is turned onto it; one further off is left and named |
| `sameFace` | tolerance | 0.000001 m | Two faces in a row this close are one face; further apart they are joined by a step |
| `flushFaces` | tolerance | 0.0002 m | Two walls in a row along a side of a room whose inner faces are this close show the room one face, since a file holds centre lines to a tenth of a millimetre; further apart they are joined by a step |
| `writtenParallel` | tolerance | 0.001 sine | Two walls in a row along a side of a room whose directions differ by less than this are parallel when its outline is traced, since a file holds an angled side's ends to a tenth of a millimetre |
| `mitreReach` | tolerance | 4 ratio | How far a joined corner may reach along a wall, in half thicknesses of the thicker wall; sharper corners are left cut square, and are not tested against openings |
| `swingContact` | tolerance | 0.01 m | How far a wall must reach into a door's swing, or two swings overlap, to be in the way; how far a swing must reach into an activity zone to be named (ARE-73) |
| `stepPastFace` | tolerance | 0.05 m | How far past a wall's face the route check steps through a door |
| `areaReported` | tolerance | 0.01 m² | The smallest area a message names; a room "wholly inside" another may have this much outside it |
| `areaEqual` | tolerance | 0.000001 m² | Two areas closer than this are the same, so an area at a figure a check applies is that figure (ARE-7); a room with less has no floor |
| `wallShare` | tolerance | 0.001 m² | Wall under a room below this is not named wall by wall |
| `touch` | tolerance | 0.002 m | How close a wall must come to a piece of floor to be one of its walls |
| `touchLength` | tolerance | 0.02 m | How long that contact must be |
| `slit` | tolerance | 0.003 m | Half the width of a slit that does not join two spaces |
| `lineInside` | tolerance | 0.05 m | The shortest stretch of a dividing line, or of a wall, inside a room that a message names |
| `squareCorner` | tolerance | 0.0175 sine | Directions this close to a right angle are square: a room with four square corners is dimensioned by its width and depth, any other side by side, and a wall this close to one of the plan's main directions is dimensioned in the chains outside it (SHT-4) |
| `chainPoint` | tolerance | 0.001 m | Two points of a chain of dimensions outside the plan closer than this are one point (SHT-4) |
| `chainSliver` | tolerance | 0.01 m | Two points between a chain's ends closer than this are one point, so a wall a little off square leaves no sliver in it (VEW-22) |
| `chainThinWall` | tolerance | 0.12 m | A solid wall thinner than this that meets a facade is marked in the walls chain at its centre line, so its thickness is no figure of its own (VEW-22) |
| `wingShare` | tolerance | 0.25 ratio | Outside walls running one way that hold this share of the outside length, in three walls or more, are a wing dimensioned square to itself; half or more is the plan's main directions (VEW-22) |
| `curvePieceTurn` | tolerance | 20 degree | The most a room's outline turns between two short straight sides that are pieces of one curve; three or more turning the same way, their corners on one circle, are dimensioned by one radius and one chord (VEW-79) |
| `curveFit` | tolerance | 0.02 m | How far a corner of such a run may lie off its circle; also how near two curved walls' face radii on one centre are one circle with one radius (VEW-79), and how far past a curved wall's faces the site's outline may lie and still be its one curved face (CNT-56) |
| `radiusLineLongest` | tolerance | 10 m | The longest a radius dimension's line is drawn; a larger radius is drawn as this much of its line by the curve, with no centre mark, and still says the whole radius (VEW-79) |
| `roomsWallWidest` | tolerance | 0.6 m | The widest gap inferred as one wall in rooms text without a wider thickness stated |
| `roomsTouch` | tolerance | 0.02 m | Rooms written rooms first closer than this touch with no wall between them, refused unless they are open to each other |
| `roomsCurveJoint` | tolerance | 0.001 m | Two pieces of a curve written rooms first whose ends are closer than this meet and are one curved wall; a wall ending this near a joint of the curve ends on the curve |
| `curveSweep` | tolerance | 0.001 radian | Two curved sides of a room whose turns round their centre differ by less than this turn through the same angle, so a room between them is a curved band; a curved side this near a whole turn goes all the way round (CMD-49) |
| `roomsCurveArea` | tolerance | 0.001 ratio | The share of a curved room's true area the area measured from its walls may differ by before the rooms-first answer says so |
| `roomsFaceSkew` | tolerance | 0.02 m | Faces of rooms written rooms first that run the opposite way and whose distance apart changes by no more than this along the shorter face each other, as on an angled side written to the centimetre |
| `roomsFaceTurn` | tolerance | 0.0872 sine | Faces of rooms written rooms first that run the opposite way within about 5 degrees of parallel, and no further apart than a wall at both ends of what they share, are one wall's two faces, drawn along their middle line (WRT-56) |
| `roomsFaceStep` | tolerance | 0.002 m | Faces of rooms written rooms first further out of line than this are named as sizes that do not add up |
| `scanFaceTurn` | tolerance | 0.0872 sine | Two scanned wall faces, or a scanned floor outline's edge and a face, within about 5 degrees of each other may be one wall's two faces, or the same face (HND-12) |
| `scanWallWidest` | tolerance | 1.8 m | The widest wall a scan pairs from two scanned wall faces (WRT-77) |
| `scanFaceReach` | tolerance | 0.05 m | An edge of a scanned floor outline this close to a scanned wall face lies on that face (HND-12) |
| `scanCornerGap` | tolerance | 0.15 m | In a scan with no floor outline, wall faces whose ends are this close meet at a corner of the room (HND-12) |
| `scanOnFloor` | tolerance | 0.05 m | A scanned door or opening whose bottom is this close to the floor stands on it, with a sill of 0 (HND-12) |
| `diffLength` | tolerance | 0.001 m | Lengths closer than this are unchanged between two versions of a plan |
| `diffMovement` | tolerance | 0.01 m | A change held to a scope that moved less than this is rounding, not an edit |
| `diffSameLine` | tolerance | 0.01 m | A removed and an added wall this close to one line may be the same wall |
| `diffOpeningOffset` | tolerance | 0.05 m | A removed and an added opening this close may be the same |
| `diffWallOverlap` | tolerance | 0.9 ratio | The share of its length a removed wall must share with an added one to be the same |
| `diffRoomAreaShare` | tolerance | 0.1 ratio | A removed and an added room whose areas differ by less than this share may be the same |
| `diffRoomCentre` | tolerance | 0.1 m | And whose centres are this close |
| `diffRoomKeptShare` | tolerance | 0.5 ratio | In a plan written rooms first, a room that kept its id or name is the same room only when the two share at least this share of the smaller one's floor (MSG-23) |
| `diffRoomOverlapShare` | tolerance | 0.75 ratio | Two rooms under any ids are the same room reshaped when they share at least this share of the larger one's floor (MSG-23) |
| `briefAbout` | tolerance | 0.05 ratio | A size the person asked for as a figure, not as at least or at most, is met when the drawn size is within this share of it, above or below (BRF-1) |
| `nameSize` | tolerance | 0.02 ratio | A size written in a room's name and the size drawn differ when they are further apart than this share of the size named (BRF-1) |
| `layoutHall` | limit | 1.1 m | Grid's own size, not a code figure. How wide the hall a first layout adds is, when the brief names no corridor (BRF-6) |
| `layoutRooms` | limit | 10 count | The most rooms a first layout places; every way of sharing them between its two rows is tried (BRF-6) |
| `layoutRowOrders` | limit | 6 count | The most rooms in one row of a first layout whose every order is tried for the rooms the brief wants to touch (BRF-6) |
| `layoutNarrowest` | limit | 1.2 m | Grid's own size, not a code figure. No side of a room a first layout draws from its area alone is narrower than this, or than the room's own square when it is smaller (WRT-61) |
| `layoutLongest` | limit | 2 ratio | A room a first layout draws from its area alone, keeping its area, is at most this many times as long as it is wide (WRT-61) |
| `diffPlace` | tolerance | 0.05 m | Two walls whose ends are this close, or two openings whose middles are, stand in the same place when two versions are compared by what stands where (WRT-8) |
| `tapedAgree` | tolerance | 0.01 m | A length taped on site and the same length drawn agree when they are no further apart than this, unless the taped length states its own tolerance; further apart, `room/taped-differs` names both figures (HND-11) |
| `setbackShort` | tolerance | 0.005 m | The building stands short of a set-back the person asked for when its outside face is more than this nearer the boundary than their figure; less rounds to the figure (`plan/setback-short`, BRF-3) |
| `pastBoundary` | tolerance | 0.005 m | The building stands over an edge of the plot's boundary when its outside face reaches more than this past it (`plan/over-boundary`, BRF-3) |
| `wallAboveStorey` | tolerance | 0.001 m | How far a wall may rise past the height its floor states; past it, `wall/above-storey` names both heights |
| `sameSpaceAlong` | tolerance | 0.05 m | Two walls of two floors, one rising past the other floor's level, stand in the same space when they lie along each other, their bodies overlapping, for more than this (`wall/same-space`, LVL-26) |
| `sameLevelOverlap` | tolerance | 0.5 ratio | Two floors at one level whose walls' boxes share more than this of the smaller one stand one over the other (`plan/same-level`) |
| `outsideDoorAboveGround` | limit | 2 m | A door to the outside on a floor higher than this above the ground (the level the site states, else the ground floor's) is named and is not a way out |
| `openingBelowGround` | tolerance | 0.005 m | A door or window in an outside wall whose foot lies less than this under the site's stated ground level stands at the ground; further down, `opening/below-ground` names it |
| `headroomLow` | limit | 1.5 m | Grid's own size, not a code figure: a room's floor with at least this much height over it, to its ceiling or the roof above it, is reported as one area (LVL-6, [areas.md](areas.md)) |
| `headroomFull` | limit | 2.2 m | Grid's own size, not a code figure: a room's floor with at least this much height over it is reported as a second area |
| `passableWidth` | limit | 0.4 m | Grid's own size, not a code figure: a door or doorless opening narrower than this is named (`opening/too-small-to-pass`) and is not a way through; outside floor closed in by walls and narrower than this is a gap, not a courtyard (`opening/into-closed-court`) |
| `passableHeight` | limit | 1.2 m | Grid's own size, not a code figure: one lower than this is named and is not a way through |
| `passableSill` | limit | 0.3 m | Grid's own size, not a code figure: one whose sill stands higher than this above its floor is named and is not a way through |
| `passableRise` | limit | 0.3 m | Grid's own size, not a code figure: one between two rooms whose floors stand further apart than this is named with both levels (`opening/between-levels`) and is not a way through without a stair (LVL-17) |
| `itemIntoWall` | tolerance | 0.005 m | How far a fixture may reach into a solid wall's body and still stand against its face; past it, `item/into-wall` names the wall |
| `itemOverlap` | tolerance | 0.005 m | How far one item may reach into another, or into the clear floor another keeps in front of it; past it, `item/overlap` or `item/clearance-blocked` names both. The same for a fixture in an activity zone and two zones that overlap (`grid_measure what=activity`, ARE-73) |
| `itemLeavesRoom` | tolerance | 0.005 m² | How much of an item's floor may lie outside its room, where no wall stands; past it, `item/leaves-room` names the room and the floor outside |
| `itemRaised` | tolerance | 1 m | How high an item's underside may be above the floor and still stand on it; from it up, the item hangs above the plan's cut, is drawn dashed, takes no floor and stands in no clear floor another keeps |
| `itemAboveRoom` | tolerance | 0.001 m | How far a fixture may rise past the height of its room; past it, `item/too-tall` names both heights |
| `useOpenLeaf` | limit | 0.05 m | Grid's own size, not a code figure: what an open door leaf and its stop take of a doorway; the clear width a door leaves is its hole less this (CNT-13) |
| `useApproachDepth` | limit | 0.3 m | Grid's own size, not a code figure: a fixture within this of a doorway's or a window's hole, across its width, stands in front of it (`item/blocks-doorway`, `item/blocks-window`) |
| `windowGlassKept` | limit | 1.2 m | Grid's own size, not a code figure: how much of a window's height must stay clear above a fixture in front of it; a fixture higher than the sill leaving less than this blocks it (`item/blocks-window`, CNT-29) |
| `useDoorwayClear` | limit | 0.8 m | Grid's own size, not a code figure: Grid's own indicator for the clear width a doorway leaves, when the person gives none |
| `usePassageWidth` | limit | 0.9 m | Grid's own size, not a code figure: Grid's own indicator for the way through a room, clear of its fixtures, when the person gives no body or trolley width |
| `useTurningCircle` | limit | 1.5 m | Grid's own size, not a code figure: Grid's own indicator for the turning circle tried in a room's free floor, when the person gives none |
| `useClearSpace` | limit | 0.6 m | Grid's own size, not a code figure: Grid's own indicator for the clear floor in front of and beside a fixture, when the person gives none |
| `useRaster` | tolerance | 0.02 m | The step of the grid the way through a room is measured on: the widest body is found to within about this |
| `useRasterCells` | limit | 250000 count | The most points one room's way through is measured on; a bigger room is measured on a coarser grid, and the answer says the step |
| `corridorRasterAcross` | limit | 24 count | The steps of the grid across a corridor's widest circle when its narrowest point is found, never finer than `useRaster`; the width there is taken from the walls themselves (ARE-25) |
| `corridorEndTurn` | tolerance | 0.5236 radian | A side of a corridor is one of its ends when the outline turns into the corridor by at least this (30 degrees) at both its corners; a jog and the pieces of a curve never are |
| `sameFloorLevel` | tolerance | 0.005 m | Rooms side by side whose floors stand closer than this in height share a level, and no step is drawn between them; so do floors that state their elevations, and neither is set against the other as a floor below it (LVL-11) |
| `floorOffsetLargest` | limit | 1.5 m | A room set further than this above or below its storey is asked about (`room/offset-question`) |
| `stairRoomOverlap` | tolerance | 0.5 ratio | Rooms used as a stair (or a lift) on neighbouring floors that share at least this of the smaller one are one stair (or shaft); less, and they are named as out of line |
| `stackShift` | tolerance | 0.05 m | A floor whose outline reaches past the floor below it, or sits back from it, by more than this and half the thickest wall that stretch runs along does not line up with it (`floor/out-of-line`, or `floor/set-back` for a floor wholly inside the one below), nor does a stair room or a lift shaft moved by more than this from the one below (`room/stair-shifted`, `room/lift-shifted`), unless the plan marks it as meant (LVL-5). A lower floor lies under a floor only where their outlines share more than this and the whole of the thickest wall along that share, so the two halves of a split level, which overlap by the wall between them, are neither under the other (LVL-11) |
| `stairStepLength` | limit | 0.63 m | A stair that states no number of risers gets the number that brings twice the riser plus the going nearest this |
| `stairSnap` | tolerance | 0.05 m | A flight or landing drawn in a section within this of a wall or a slab it faces is drawn touching it, so the cut is one outline with no sliver of white between them (VEW-57) |
| `stairWaist` | limit | 0.15 m | How thick a flight of stairs is drawn in a section, under the roots of its steps and square to its slope, and a landing, at least one riser: the plan states no waist (VEW-11) |
| `planCutHeight` | limit | 1.2 m | How high above a floor its plan is cut: a stair rising from the floor is drawn solid up to this height, with a break line there, and dashed above (SHT-11) |
| `plinthLeast` | tolerance | 0.005 m | A floor on the ground whose slab stands higher than this above the site's stated ground is carried down to the ground on a plinth in its sections and facades (VEW-16); lower, it stands at the ground |
| `sectionEarthBelow` | limit | 1 m | How far below the lowest thing a section cuts under the ground, or below the ground where it cuts nothing there, the earth is drawn (VEW-65) |
| `elevationMarkOffset` | limit | 1.2 m | How far outside the drawing and its dimensions an elevation mark stands on a plan (LVL-9) |
| `aboveSameEdge` | tolerance | 0.02 m | A stretch of the outline of the floor above this close to the outline of the floor drawn, along it, is the same wall face, and is not drawn dashed (SHT-11) |
| `wideSingleLeaf` | limit | 1.5 m | A door at least this wide that states no kind is taken as one swinging leaf and asked about (`opening/wide-single-leaf`, CNT-14) |
| `foldingPanel` | limit | 0.6 m | The widest panel a folding door is drawn and checked with: it folds in as many panels as this needs, two at least, and sweeps a strip one panel deep (CNT-14) |
| `frameFace` | limit | 0.05 m | How wide a door's or window's frame, and the frame round each part of a window that opens, is drawn in 3D (CNT-14), and each side's frame on a plan drawn in detail (SHT-10) |
| `frameDepth` | limit | 0.07 m | How deep a window's frame is drawn in 3D and on a plan drawn in detail, in the middle of its wall; a door's frame lines the wall's whole depth (CNT-14, SHT-10) |
| `leafThickness` | limit | 0.04 m | How thick a door leaf or panel is drawn in 3D, hung from the face of the wall it opens toward (CNT-14) |
| `glassThickness` | limit | 0.02 m | How thick a window's glass is drawn in 3D, in the middle of its frame (CNT-14), and how far apart its two panes are on a plan drawn in detail (SHT-10) |
| `floorLift` | limit | 0.005 m | How far a room's floor is raised above the slab it stands on in an OBJ or GLB, so the two never share a plane and flicker in a viewer (VEW-73) |
| `wallPieceShortest` | limit | 0.05 m | The shortest piece a GLB writes a wall split at the rooms beside it as; a shorter stretch joins the piece before it (VEW-82) |
| `doorOpenAngle` | limit | 90 degree | How far a GLB written with its doors open turns each swinging leaf on its hinge (VEW-82) |
| `cameraNear` | limit | 0.05 m | How near a GLB's camera, made from a saved view, starts to see: its near plane (VEW-82) |
| `liningOnFace` | tolerance | 0.02 m | How far a side of a room's inside outline may be from a wall's face and still be drawn as that face, tinted by the room's wall finish in 3D (VEW-78) |
| `liningOffset` | limit | 0.002 m | How far into the room a wall finish is drawn off its wall's face in 3D, and a ceiling under the slab above, so each shows over what it covers; a band twice as far (VEW-78) |
| `sillProjection` | limit | 0.03 m | How far a window's sill stands out from each face of its wall, and past each side of its hole, on a plan drawn in detail (SHT-10) |
| `facadeFacing` | tolerance | 0.0175 sine | A face of the building is drawn on a facade when it turns at least this much (about one degree) toward the side the facade is seen from (LVL-8) |
| `facadeOnFace` | tolerance | 0.01 m | A wall whose outside face lies within this of a stretch of the floor's outline is the wall that stretch of a facade shows, with its height and openings (LVL-8) |
| `facadeRoofProjection` | limit | 0.3 m | How far a pitched roof is drawn past its outside walls in elevation (VEW-71) |
| `facadeSameDepth` | tolerance | 0.05 m | Faces of a facade within this of each other, front to back, are one plane, drawn with one line weight; a face set back further is drawn lighter (LVL-8) |
| `facadeSillDepth` | limit | 0.05 m | How deep a window's sill is drawn on a facade, under its hole and running past each side as far as a sill stands out on a plan drawn in detail (VEW-63) |
| `facadeHeadDepth` | limit | 0.15 m | How deep a window's head is drawn on a facade, over its hole and as wide as it, no higher than its wall (VEW-63) |
| `columnRoundPieces` | limit | 32 count | How many straight sides a round column is drawn and exported with, and cut to its room with; its own area, and what it takes off a room it stands wholly in, is the true circle's (CNT-16) |
| `gridLinesMost` | limit | 100 count | The most lines one set of a structural grid may have; a set with more is refused (CNT-16) |
| `languageNamesLeast` | limit | 2 count | The fewest room names that are one language's word for a use, and none another's, before writing rooms text records that language as the plan's own (MSG-34) |
| `gridOverrun` | limit | 1.5 m | How far a structural grid's lines are drawn past the outermost line across them, where their names are written and their spacing is dimensioned (CNT-16) |
| `gridArcStep` | limit | 5 degree | The widest turn one straight piece of a radial grid's ring is drawn and exported with; a ring that is not whole stops this much short of closing at most (WRT-83) |
| `bayOverlap` | tolerance | 0.01 m² | Two parking bays of one floor that share more floor than this overlap: each is still counted, and the warning says the floor holds fewer bays than it counts (CNT-19) |
| `rampSlopeDiffers` | tolerance | 0.5 % | A ramp's stated slope further than this, in percentage points, from the slope its two levels and its run give is worth a look; both are kept and returned (CNT-19) |
| `sunLowest` | tolerance | 0.5 degree | The sun lower than this above the horizon casts no shadow Grid works out: everything is taken as in shade (CNT-58) |
| `sunStepMinutes` | limit | 30 minute | The time between the moments the sun is worked out at over a range of hours, when the call gives none (CNT-58) |
| `sunStepDays` | limit | 7 day | The days between the dates the sun is worked out on over a range of dates, when the call gives none; the last date is always one (CNT-58) |
| `sunMomentsMost` | limit | 2000 count | The most moments one call works the sun and its shadows out at; more is refused with the step that fits (CNT-58) |
| `sunFaceFoot` | tolerance | 0.05 m | How far in front of a building face its foot is taken, to say how much of it lies in the shadow of something else (CNT-58) |
| `sunFaceShortest` | tolerance | 0.5 m | A straight stretch of a building's outline shorter than this is no face of its own when the sun on the faces is said (CNT-58) |
| `fenceCasts` | tolerance | 0.05 m | The thickness a site fence with a height is taken as when it casts a shadow (CNT-58) |
| `treeCrownBase` | tolerance | 0.4 ratio | Where a tree's crown starts, as a share of its height, when it casts a shadow: a disc of its canopy from there to its top (CNT-58) |
| `canopySides` | limit | 24 count | The straight sides a tree's round canopy is traced with when it casts a shadow (CNT-58) |
| `largest` | limit | 10000000 m | The largest coordinate or size Grid accepts (10,000 km); past it the part is refused |
| `farFromOrigin` | limit | 500 m | A plan reaching further from the origin gets a warning: from `site.origin` where the plan states one, else from (0, 0) (HND-11) |
| `cameraTilt` | limit | 89 degree | How far a camera may look down at, or up to, what it is pointed at, from level; straight down or up a picture has no up, so a camera turned further is refused (VEW-3) |
| `cameraClosest` | limit | 0.1 m | The least distance from a camera to what it is pointed at (VEW-3) |
| `lensShortest` | limit | 8 mm | The shortest focal length a camera may have, on a 36 × 24 mm sensor: about 132° across (VEW-3) |
| `lensLongest` | limit | 800 mm | The longest focal length a camera may have, on a 36 × 24 mm sensor: under 3° across (VEW-3) |
| `wallThinnest` | limit | 0.02 m | A thinner solid wall is questioned; a line with no substance should be virtual |
| `wallThickest` | limit | 3 m (1.5 in a home) | A thicker wall is questioned |
| `wallLowest` | limit | 0.1 m | A lower solid wall is questioned |
| `wallHighest` | limit | 40 m (10 in a home, 80 in a hall) | A higher wall is questioned |
| `wallBalustradeHighest` | limit | 2 m | A solid wall lower than this is a balustrade or rail, a little under a door: it is not counted in the typical wall of its floor |
| `wallHigherThanTypical` | limit | 4 ratio | A wall this many times higher than the typical one on its floor (with three others or more) is questioned |
| `openingNarrowest` | limit | 0.2 m | A narrower opening is questioned; whether a door is a way through is `passableWidth` |
| `openingLowest` | limit | 0.2 m | A lower opening is questioned |
| `storeyLowest` | limit | 2 m | Grid's own size, not a code figure: a floor stating a lower height is questioned, and one under another floor stating none whose tallest wall is lower; a floor under a roof of its own only below `wallLowest` (LVL-18); a lower wall is no storey high, and its own height is not set against its floor's (LVL-24) |
| `stairDoorLowest` | limit | 1.8 m | Grid's own size, not a code figure: a lower door or doorless opening onto a room used as a stair or a lift is questioned (LVL-18) |
| `roomLargest` | limit | 50000 m² (1000 in a home, 500000 in a hall) | A larger room is questioned |
| `homeRoomSmallest` | limit | 4 m² | Grid's own size, not a code figure: a bedroom, living room or dining room of a home with less net floor is asked about after the check, with no place needed (ARE-72) |
| `homeRoomNarrowest` | limit | 1.8 m | Grid's own size, not a code figure: a bedroom, living room or dining room of a home whose widest circle is narrower is asked about (ARE-72) |
| `homeWetRoomSmallest` | limit | 0.8 m² | Grid's own size, not a code figure: a kitchen, bathroom or toilet of a home with less net floor is asked about (ARE-72) |
| `homeWetRoomNarrowest` | limit | 0.6 m | Grid's own size, not a code figure: a kitchen, bathroom or toilet of a home whose widest circle is narrower is asked about (ARE-72) |
| `typicalHeightLowest` | limit | 1.8 m | The units question: the typical wall height of a building, from this… |
| `typicalHeightHighest` | limit | 6 m (30 in a hall) | …to this |
| `typicalThicknessLowest` | limit | 0.08 m | The typical wall thickness that agrees with a unit, from this… |
| `typicalThicknessHighest` | limit | 1 m | …to this |
| `typicalDoorLowest` | limit | 0.5 m | The typical door width that agrees with a unit, from this… |
| `typicalDoorHighest` | limit | 2.5 m | …to this |
| `roomsSideAsked` | limit | 200 m (50 in a home, 1000 in a hall) | A room side written rooms first as a bare number, stretched with `*` or drawn as a polygon, longer than this is asked about (`rooms/size-question`); written with its unit it is taken as meant (WRT-22) |
| `roomsSideBare` | limit | 2000 m | A room side written rooms first as a bare number longer than this is refused as most likely millimetres (`rooms/size`); written with its unit it is taken (WRT-22) |
| `openingWidest` | limit | 1000 m | The widest door, window or opening an edit takes; below it the wall decides, and an opening that does not fit is refused with the free stretches (WRT-22) |
| `traceUnscaled` | limit | 0.01 m | A trace image with no scale of its own is drawn at this many metres a pixel, and said to be unscaled (HND-10) |
| `lintelBearing` | limit | 0.15 m | The bearing taken at each end of a lintel over a new opening cut through a wall that stays, when the work is costed (`grid_takeoff` with `for: "change"`); the plan holds no lintels, so the line is marked assumed (ARE-71) |
