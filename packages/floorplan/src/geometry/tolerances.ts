/**
 * Grid's tolerances and limits: the one table every check reads (MSG-15).
 *
 * Every figure here is Grid's own, chosen for checking a drawing. None comes from a building
 * code or a standard, none cites a document, and none says what a building must be. A limit
 * only decides when Grid asks whether a size is meant. That is why the entries carry no source:
 * there is none to cite.
 *
 * There are three kinds of entry:
 *
 * - `tolerance`: how close two things must be to count as one, or how far one may run past
 *   another and still fit. Drawn by hand, a plan is exact to a millimetre or so; a survey or a
 *   scan is not, and loosening these is how a survey is checked (`withTolerances`).
 * - `limit`: a size past which Grid refuses a number (`largest`) or asks whether it is meant
 *   (the plausibility limits). A limit with a `home` figure uses that figure where the plan
 *   says it is a home: a room in it is used as a bedroom or a living room. One with a `hall`
 *   figure uses that where the plan, or a floor of it, says it is a building of large halls:
 *   for assembly, sport, industry or a warehouse (WRT-22).
 * - `arithmetic`: what the floating-point numbers can tell apart. These guard against rounding
 *   noise, say nothing about a building, and cannot be adjusted.
 *
 * The checks read an entry when they run, through `tolerance` and `limit`, so a change made with
 * `withTolerances` reaches every check that runs inside it.
 */

export type ToleranceKind = 'tolerance' | 'limit' | 'arithmetic'

/** What an entry is in. A `ratio`, a `sine` and a `count` have no unit; `mm` is a lens's focal length (VEW-3); `%` a slope's percentage points (CNT-19); `minute` and `day` the steps the sun is worked out at (CNT-58). */
export type ToleranceUnit = 'm' | 'm²' | 'mm' | 'degree' | 'radian' | 'sine' | 'ratio' | 'count' | '%' | 'minute' | 'day'

/** The kinds of building a limit can depend on, as the plan says it (`buildingKind`). */
export type BuildingKind = 'any' | 'home' | 'hall'

export interface ToleranceEntry {
  readonly kind: ToleranceKind
  readonly value: number
  /** The figure in a home, where it differs. Plausibility limits only. */
  readonly home?: number
  /** The figure in a building of large halls, where it differs (WRT-22). Plausibility limits only. */
  readonly hall?: number
  readonly unit: ToleranceUnit
  /** What the figure decides, in Grid's words. */
  readonly decides: string
  /** Always the same: the figure is Grid's own check on the drawing and cites no document. */
  readonly basis: 'grid-drawing-check'
}

/** The grids that a polygon join is retried on, coarsest last, in metres. */
export interface GridsEntry {
  readonly kind: 'arithmetic'
  readonly values: readonly number[]
  readonly unit: 'm'
  readonly decides: string
  readonly basis: 'grid-drawing-check'
}

const own = 'grid-drawing-check' as const

/**
 * The table. Changing a value here changes every check that uses it; record the change in the
 * step's review file, with what it moved.
 */
export const TOLERANCES = {
  // ── Openings ──────────────────────────────────────────────────────────────────────────────
  openingOverrun: {
    kind: 'tolerance',
    value: 0.001,
    unit: 'm',
    decides:
      'How far an opening may run past either end of its wall, below the floor, above the top of ' +
      'its wall or into the next opening on its wall, and still fit; also how far it may run into ' +
      'the body of a wall that meets its wall before that is named (MSG-16), and how near a jamb the centre ' +
      'line of a wall that ends on its wall may meet it and be taken for that jamb (ARE-32). A wall whose ends were ' +
      'rounded to the millimetre is up to this much shorter than intended. A refusal states the ' +
      'overrun and the offset that fits.',
    basis: own
  },

  // ── Curved walls (CNT-18) ─────────────────────────────────────────────────────────────────
  arcEnds: {
    kind: 'tolerance',
    value: 0.005,
    unit: 'm',
    decides:
      'How far a curved wall\'s end may lie from where its sweep takes its start round its centre, ' +
      'and how far the two ends may differ in their distance from the centre, and still be one ' +
      'arc; further, `wall/arc-ends-apart` names the wall and where its end should be.',
    basis: own
  },
  arcSagitta: {
    kind: 'tolerance',
    value: 0.001,
    unit: 'm',
    decides:
      'How far the straight pieces a curved wall is traced, checked and drawn with may stand off ' +
      'its curve at their middle. Smaller pieces are taken where this alone would leave too few ' +
      '(`arcStep`).',
    basis: own
  },
  arcStep: {
    kind: 'tolerance',
    value: 0.03,
    unit: 'radian',
    decides:
      'The most a curved wall turns through along one of its straight pieces, so that a small ' +
      'round room measures within a few hundredths of a percent of its true area: a straight ' +
      'piece cuts off a sliver of the curve, and the sliver shrinks with the square of this.',
    basis: own
  },
  arcPiecesMost: {
    kind: 'limit',
    value: 1000,
    unit: 'count',
    decides:
      'The most straight pieces one curved wall is traced with; a curve longer than these pieces ' +
      'can follow within `arcSagitta` is traced with this many, a little further off it.',
    basis: own
  },
  polygonOnCircle: {
    kind: 'tolerance',
    value: 0.02,
    unit: 'm',
    decides:
      'How far each corner of a room drawn with straight walls may lie off one circle and still be ' +
      'read as a curve written as a polygon (CMD-51): its answer says how to write it as a circle.',
    basis: own
  },
  polygonOnCircleCorners: {
    kind: 'limit',
    value: 12,
    unit: 'count',
    decides:
      'The fewest corners a room on one circle (`polygonOnCircle`) has before it is read as a curve ' +
      'written as a polygon, so a hexagon or an octagon drawn on purpose is not.',
    basis: own
  },
  smoothRunTurn: {
    kind: 'tolerance',
    value: 5,
    unit: 'degree',
    decides:
      'The most two walls that meet end to end may turn where they meet and still be one smooth ' +
      'run, which a door or window may cross from one onto the other (VEW-77): a curve traced by ' +
      'short pieces, or two arcs that meet without a kink. A sharper turn is a corner.',
    basis: own
  },

  // ── Walls that meet ───────────────────────────────────────────────────────────────────────
  gap: {
    kind: 'tolerance',
    value: 0.02,
    unit: 'm',
    decides:
      'A wall reaches the wall it meets when its end lies within half the thicker of the two ' +
      'walls plus this much of the other wall\'s line: walls are drawn to faces as well as to ' +
      'centre lines. Wall bodies already reach half their thickness, so the check of the spaces ' +
      'walls enclose lengthens every wall by this much at both ends. The wall faults name a wall ' +
      'short of its corner or past it by more than that, and two walls whose bodies overlap by ' +
      'more than this across their width.',
    basis: own
  },
  wallContact: {
    kind: 'tolerance',
    value: 0.01,
    unit: 'm',
    decides:
      'Slack beyond the walls\' own bodies when a room\'s outline is traced: two walls this much ' +
      'further apart than their half thicknesses still touch or carry on in a row, a corner this ' +
      'far past a wall\'s end is still at that end, and a corner may lie the thicker wall plus ' +
      'this from a wall that is said to reach it.',
    basis: own
  },
  strayCorner: {
    kind: 'tolerance',
    value: 1,
    unit: 'm',
    decides:
      'A corner of a room further than this from both of its walls (or further than the thicker ' +
      'wall plus `wallContact`, when that is more) is not a corner: the walls do not meet there, ' +
      'their lines merely cross, and the wall list is out of order.',
    basis: own
  },
  nearlyParallel: {
    kind: 'tolerance',
    value: 0.2588,
    unit: 'sine',
    decides:
      'Two neighbouring walls of a room whose directions differ by less than this (the sine of ' +
      '15 degrees) may be one straight side, when they touch end to end.',
    basis: own
  },
  // WRT-6 (lab AE-4): squaring a scan.
  squareWithin: {
    kind: 'tolerance',
    value: 0.0523,
    unit: 'sine',
    decides:
      'When a scan is squared, a wall whose direction is closer than this (the sine of about 3 ' +
      'degrees) to one of the plan\'s main directions is turned onto it; a wall further off is ' +
      'left as it is and named.',
    basis: own
  },
  sameFace: {
    kind: 'tolerance',
    value: 1e-6,
    unit: 'm',
    decides:
      'Two walls in a row whose inner faces are on one line to within this show the room one ' +
      'face. Faces further apart are joined by a step of that size.',
    basis: own
  },
  // ARE-34: a plan file holds centre lines to a tenth of a millimetre, so the faces of two walls
  // of different thickness meant to be one line can be that far apart each way.
  flushFaces: {
    kind: 'tolerance',
    value: 0.0002,
    unit: 'm',
    decides:
      'Two walls in a row along one side of a room whose inner faces are this close show the room ' +
      'one face, as if on one line: a face held to a tenth of a millimetre in the file is a hair ' +
      'off another wall\'s. Faces further apart are joined by a step.',
    basis: own
  },
  // CNT-36: and so the walls of one straight side written at an angle are a hair off parallel.
  writtenParallel: {
    kind: 'tolerance',
    value: 0.001,
    unit: 'sine',
    decides:
      'Two walls in a row along one side of a room whose directions differ by less than this (the ' +
      'sine of about a twentieth of a degree) are parallel when the room\'s outline is traced: ' +
      'ends held to a tenth of a millimetre in the file leave an angled side that far off.',
    basis: own
  },
  mitreReach: {
    kind: 'tolerance',
    value: 4,
    unit: 'ratio',
    decides:
      'How far a joined corner may reach along a wall from the point where the walls meet, in ' +
      'half thicknesses of the thicker wall. Walls meeting at so sharp an angle that their faces ' +
      'cross further out than this are left cut square there, as a drawing would bevel them, ' +
      'instead of ending in a long spike. Such a meeting is not tested against the openings of ' +
      'either wall either (MSG-16).',
    basis: own
  },
  swingContact: {
    kind: 'tolerance',
    value: 0.01,
    unit: 'm',
    decides:
      'How far a wall must reach into a door\'s swing before it is in the way, and how wide the ' +
      'overlap of two swings must be before they collide. A wall that touches the jamb or rests ' +
      'against the open leaf is not in the way. ARE-73: how far a swing must reach into an ' +
      'activity zone to be named.',
    basis: own
  },
  stepPastFace: {
    kind: 'tolerance',
    value: 0.05,
    unit: 'm',
    decides:
      'How far past a wall\'s face the route check steps through a door to find the room on the ' +
      'other side.',
    basis: own
  },

  // ── Areas ─────────────────────────────────────────────────────────────────────────────────
  areaReported: {
    kind: 'tolerance',
    value: 0.01,
    unit: 'm²',
    decides:
      'The smallest area a message names: floor no room claims, floor two rooms share, a room\'s ' +
      'floor outside its walls. A room "wholly inside" another may have this much outside it. ' +
      'The scoreboard says two areas differ past the same figure.',
    basis: own
  },
  areaEqual: {
    kind: 'tolerance',
    value: 1e-6,
    unit: 'm²',
    decides:
      'Two areas closer than this are the same, and a room with less floor than this has none. ' +
      'Far below what is printed, so an area drawn at exactly a figure is never read as a hair ' +
      'under it.',
    basis: own
  },
  wallShare: {
    kind: 'tolerance',
    value: 0.001,
    unit: 'm²',
    decides: 'Wall lying under a room below this is not named wall by wall.',
    basis: own
  },

  // ── The spaces the walls enclose (spaces.ts) ──────────────────────────────────────────────
  touch: {
    kind: 'tolerance',
    value: 0.002,
    unit: 'm',
    decides: 'How close a wall must come to a piece of floor to be named as one of its walls.',
    basis: own
  },
  touchLength: {
    kind: 'tolerance',
    value: 0.02,
    unit: 'm',
    decides: 'How long that contact must be.',
    basis: own
  },
  slit: {
    kind: 'tolerance',
    value: 0.003,
    unit: 'm',
    decides:
      'Half the width of a slit that does not join two spaces: two rooms lie in one space only ' +
      'when they still do with every wall and line widened by this much.',
    basis: own
  },
  lineInside: {
    kind: 'tolerance',
    value: 0.05,
    unit: 'm',
    decides: 'The shortest stretch of a dividing line, or of a wall, inside a room that a message names.',
    basis: own
  },

  // ── Dimensions (SHT-4) ────────────────────────────────────────────────────────────────────
  squareCorner: {
    kind: 'tolerance',
    value: 0.0175,
    unit: 'sine',
    decides:
      'Two directions within this of a right angle (the sine of about 1 degree) are square. A ' +
      'room whose four corners are square is dimensioned by its width and depth, any other room ' +
      'side by side; a wall this close to one of the plan\'s two main directions is dimensioned ' +
      'in the chains outside the plan.',
    basis: own
  },
  chainPoint: {
    kind: 'tolerance',
    value: 0.001,
    unit: 'm',
    decides:
      'Two points of a chain of dimensions outside the plan closer than this along it are one ' +
      'point, so no dimension in a chain is shorter than this.',
    basis: own
  },
  chainSliver: {
    kind: 'tolerance',
    value: 0.01,
    unit: 'm',
    decides:
      'Two points between the ends of a chain of dimensions outside the plan closer than this ' +
      'along it are one point (VEW-22): a wall a degree or two off square leaves no sliver of a ' +
      'few millimetres in the chain.',
    basis: own
  },
  chainThinWall: {
    kind: 'tolerance',
    value: 0.12,
    unit: 'm',
    decides:
      'A solid wall thinner than this that meets a facade is marked in the walls chain at its ' +
      'centre line, as a dividing line is, so its thickness is not written as a figure of its ' +
      'own (VEW-22); a thicker wall is marked at both faces.',
    basis: own
  },
  wingShare: {
    kind: 'tolerance',
    value: 0.25,
    unit: 'ratio',
    decides:
      'Outside walls that run one way (square to each other) and hold at least this share of ' +
      'the outside length, in three walls or more, are a wing, dimensioned square to itself ' +
      '(VEW-22). One way holding half the length or more is the plan\'s main directions.',
    basis: own
  },
  curvePieceTurn: {
    kind: 'tolerance',
    value: 20,
    unit: 'degree',
    decides:
      'The most a room\'s outline may turn at a corner between two short straight sides that are ' +
      'pieces of one curve (VEW-79). Three sides or more that turn the same way by no more than ' +
      'this, their corners on one circle (`curveFit`), are dimensioned as a curve, by one radius ' +
      'and one chord, never piece by piece.',
    basis: own
  },
  curveFit: {
    kind: 'tolerance',
    value: 0.02,
    unit: 'm',
    decides:
      'How far a corner of a run of short straight sides may lie off the circle through the ' +
      'run\'s ends and middle and still be a piece of that curve (VEW-79); also how near two curved ' +
      'walls\' face radii, on one centre, must be to be one circle, dimensioned by one radius; and ' +
      'how far past a curved wall\'s faces a stretch of the building\'s outline seen from above ' +
      'may lie and still be that wall\'s one curved face on the site (CNT-56).',
    basis: own
  },
  radiusLineLongest: {
    kind: 'tolerance',
    value: 10,
    unit: 'm',
    decides:
      'The longest a radius dimension\'s line is drawn (VEW-79). A larger radius is drawn as this ' +
      'much of its line next to the curve, with no centre mark, so a distant centre does not ' +
      'stretch the drawing; its figure is still the whole radius.',
    basis: own
  },

  // ── Writing a plan rooms first (rooms/, WRT-2) ────────────────────────────────────────────
  roomsWallWidest: {
    kind: 'tolerance',
    value: 0.6,
    unit: 'm',
    decides:
      'The widest gap between two rooms written rooms first that is still one wall without a wider thickness stated. ' +
      'A wider gap that is not a room is refused, naming both rooms.',
    basis: own
  },
  roomsTouch: {
    kind: 'tolerance',
    value: 0.02,
    unit: 'm',
    decides:
      'Two rooms written rooms first that are closer than this touch, with no wall between them: ' +
      'refused unless the rooms are said to be open to each other.',
    basis: own
  },
  roomsCurveJoint: {
    kind: 'tolerance',
    value: 0.001,
    unit: 'm',
    decides:
      'Two pieces of a curve written rooms first (WRT-78) whose ends are closer than this meet, ' +
      'and are one curved wall; a wall that ends this near a joint of the curve ends on the curve.',
    basis: own
  },
  // CMD-49: a room's sides as a person names them.
  curveSweep: {
    kind: 'tolerance',
    value: 0.001,
    unit: 'radian',
    decides:
      'Two curved sides of a room whose turns round their centre differ by less than this (about ' +
      'a twentieth of a degree) turn through the same angle, so a room between them is a curved ' +
      'band; a curved side this near a whole turn goes all the way round.',
    basis: own
  },
  roomsCurveArea: {
    kind: 'tolerance',
    value: 0.001,
    unit: 'ratio',
    decides:
      'The share of a curved room\'s true area that the area Grid measures from its walls may differ ' +
      'by before the rooms-first answer says so: a curve is traced by short straight pieces, and ' +
      'where a curve meets a wall at a slant its end runs on to that wall\'s middle line.',
    basis: own
  },
  roomsFaceSkew: {
    kind: 'tolerance',
    value: 0.02,
    unit: 'm',
    decides:
      'Two faces of rooms written rooms first that run the opposite way, and whose distance apart ' +
      'changes by no more than this along the shorter of them, face each other: a wall, a dividing ' +
      'line or an open side lies between them. Corners written to the centimetre on an angled side ' +
      'leave a few millimetres (CNT-36).',
    basis: own
  },
  roomsFaceTurn: {
    kind: 'tolerance',
    value: 0.0872,
    unit: 'sine',
    decides:
      'Two faces of rooms written rooms first that run the opposite way, out of parallel by less ' +
      'than this (the sine of 5 degrees) and no further apart than a wall at both ends of what they ' +
      'share, are the two faces of one wall between them, drawn along their middle line, as a ' +
      'scanned room\'s are (WRT-56).',
    basis: own
  },
  roomsFaceStep: {
    kind: 'tolerance',
    value: 0.002,
    unit: 'm',
    decides:
      'Two faces of rooms written rooms first that run side by side further out of line than this ' +
      'are named as sizes that do not add up.',
    basis: own
  },

  // ── Reading a phone room scan (scan/, HND-12) ─────────────────────────────────────────────
  scanFaceTurn: {
    kind: 'tolerance',
    value: 0.0872,
    unit: 'sine',
    decides:
      'Two scanned wall faces, or an edge of a scanned floor outline and a face, whose directions ' +
      'differ by less than this (the sine of 5 degrees) may be the two faces of one wall, or the ' +
      'same face.',
    basis: own
  },
  scanWallWidest: {
    kind: 'tolerance',
    value: 1.8,
    unit: 'm',
    decides: 'Two scanned wall faces may bound one wall up to this width when they face each other across the gap (WRT-77).',
    basis: own
  },
  scanFaceReach: {
    kind: 'tolerance',
    value: 0.05,
    unit: 'm',
    decides: 'An edge of a scanned floor outline this close to a scanned wall face, along its length, lies on that face.',
    basis: own
  },
  scanCornerGap: {
    kind: 'tolerance',
    value: 0.15,
    unit: 'm',
    decides:
      'In a scan that gives no floor outline, the end of one wall face this close to the end of ' +
      'another meets it at a corner of the room.',
    basis: own
  },
  scanOnFloor: {
    kind: 'tolerance',
    value: 0.05,
    unit: 'm',
    decides: 'A scanned door or opening whose bottom is this close to the floor stands on it: its sill is 0.',
    basis: own
  },

  // ── Comparing two versions of a plan (diff/) ──────────────────────────────────────────────
  diffLength: {
    kind: 'tolerance',
    value: 0.001,
    unit: 'm',
    decides: 'Two lengths or coordinates closer than this are unchanged between two versions.',
    basis: own
  },
  diffMovement: {
    kind: 'tolerance',
    value: 0.01,
    unit: 'm',
    decides: 'When an edit is held to a scope, a change whose numbers all moved less than this is rounding, not an edit, and is ignored.',
    basis: own
  },
  diffSameLine: {
    kind: 'tolerance',
    value: 0.01,
    unit: 'm',
    decides: 'A removed wall and an added wall closer than this to one line may be the same wall.',
    basis: own
  },
  diffOpeningOffset: {
    kind: 'tolerance',
    value: 0.05,
    unit: 'm',
    decides: 'A removed opening and an added one whose offsets differ by less than this may be the same.',
    basis: own
  },
  diffWallOverlap: {
    kind: 'tolerance',
    value: 0.9,
    unit: 'ratio',
    decides: 'The share of its length a removed wall must have in common with an added one to be the same wall.',
    basis: own
  },
  diffRoomAreaShare: {
    kind: 'tolerance',
    value: 0.1,
    unit: 'ratio',
    decides: 'A removed room and an added one whose areas differ by less than this share of the larger may be the same.',
    basis: own
  },
  diffRoomCentre: {
    kind: 'tolerance',
    value: 0.1,
    unit: 'm',
    decides: 'And a removed room and an added one whose centres are closer than this may be the same.',
    basis: own
  },
  diffRoomKeptShare: {
    kind: 'tolerance',
    value: 0.5,
    unit: 'ratio',
    decides:
      'When two versions of a plan written rooms first are compared (MSG-23): a room that kept its ' +
      'id or its name is the same room only when the floor the two share is at least this share of ' +
      'the smaller of them; one that shares less is another room that took the id or the name.',
    basis: own
  },
  diffRoomOverlapShare: {
    kind: 'tolerance',
    value: 0.75,
    unit: 'ratio',
    decides:
      'When two versions are compared (MSG-23): two rooms on one floor, under any ids, are the same ' +
      'room reshaped when the floor they share is at least this share of the larger of them. Two ' +
      'rooms knocked into one stay a merge: neither is this much of the room they became.',
    basis: own
  },
  diffPlace: {
    kind: 'tolerance',
    value: 0.05,
    unit: 'm',
    decides:
      'When two versions are compared by what stands where (WRT-8): two walls whose ends are this ' +
      'close, either way round, once the drawing is moved to its new origin, stand in the same ' +
      'place, and so do two openings whose middles are this close. An opening has stayed where it ' +
      'was in its room when it moved along its wall by less than this beyond the room itself.',
    basis: own
  },

  // ── The brief beside the plan (BRF-1) ─────────────────────────────────────────────────────
  briefAbout: {
    kind: 'tolerance',
    value: 0.05,
    unit: 'ratio',
    decides:
      'A size the person asked for as a figure, not as at least or at most, is met when the drawn ' +
      'size is within this share of it, above or below: asked 4.5 m², 4.3 to 4.7 m² is met.',
    basis: own
  },
  nameSize: {
    kind: 'tolerance',
    value: 0.02,
    unit: 'ratio',
    decides:
      'A size written in a room\'s name (12 m², 6 tatami) and the size drawn differ when they are ' +
      'further apart than this share of the size named: a room named 6 mats that holds 5.8 does.',
    basis: own
  },

  // ── A first layout from the brief (BRF-6) ─────────────────────────────────────────────────
  layoutHall: {
    kind: 'limit',
    value: 1.1,
    unit: 'm',
    decides:
      'Grid\'s own size, not a code figure. How wide the hall a first layout adds is, when the ' +
      'brief names no corridor.',
    basis: own
  },
  layoutRooms: {
    kind: 'limit',
    value: 10,
    unit: 'count',
    decides:
      'The most rooms a first layout places: every way of sharing them between its two rows is tried.',
    basis: own
  },
  layoutRowOrders: {
    kind: 'limit',
    value: 6,
    unit: 'count',
    decides:
      'The most rooms in a row of a first layout whose every order is tried; a longer row keeps the brief\'s order.',
    basis: own
  },
  layoutNarrowest: {
    kind: 'limit',
    value: 1.2,
    unit: 'm',
    decides:
      'Grid\'s own size, not a code figure. No side of a room a first layout draws from its area ' +
      'alone is narrower than this, or than the room\'s own square when it is smaller (WRT-61).',
    basis: own
  },
  layoutLongest: {
    kind: 'limit',
    value: 2,
    unit: 'ratio',
    decides:
      'A room a first layout draws from its area alone, keeping its area, is at most this many ' +
      'times as long as it is wide (WRT-61).',
    basis: own
  },

  // ── A survey drawn from its own numbers (HND-11) ──────────────────────────────────────────
  tapedAgree: {
    kind: 'tolerance',
    value: 0.01,
    unit: 'm',
    decides:
      'A length taped on site and the same length drawn agree when they are no further apart ' +
      'than this, unless the taped length states its own; further apart, the taped length is ' +
      'named with both figures (`room/taped-differs`).',
    basis: own
  },

  // ── The plot (BRF-3) ──────────────────────────────────────────────────────────────────────
  setbackShort: {
    kind: 'tolerance',
    value: 0.005,
    unit: 'm',
    decides:
      'The building stands short of a set-back the person asked for when its outside face is more ' +
      'than this nearer the boundary than the figure they gave: a distance that rounds to the ' +
      'figure at the centimetre is not named.',
    basis: own
  },
  pastBoundary: {
    kind: 'tolerance',
    value: 0.005,
    unit: 'm',
    decides:
      'The building stands over an edge of the plot\'s boundary when its outside face reaches more ' +
      'than this past the edge, out of the plot. Less is the edge drawn on the face.',
    basis: own
  },

  // ── Floors (LVL-1) ────────────────────────────────────────────────────────────────────────
  wallAboveStorey: {
    kind: 'tolerance',
    value: 0.001,
    unit: 'm',
    decides:
      'How far a wall may rise past the height its floor states and still fit inside the storey. ' +
      'Past it, the wall is named with both heights.',
    basis: own
  },
  sameLevelOverlap: {
    kind: 'tolerance',
    value: 0.5,
    unit: 'ratio',
    decides:
      'Two floors at one level stand one over the other when the boxes around their walls share ' +
      'more than this share of the smaller box. Floors side by side at one level share less.',
    basis: own
  },
  outsideDoorAboveGround: {
    kind: 'limit',
    value: 2,
    unit: 'm',
    decides:
      'A door to the outside on a floor standing higher than this above the ground (the level the ' +
      'site states, else the ground floor\'s) opens in mid-air: it is named, and it is not a way out. ' +
      'Lower, a few steps outside can reach the ground.',
    basis: own
  },

  openingBelowGround: {
    kind: 'tolerance',
    value: 0.005,
    unit: 'm',
    decides:
      'A door or window in an outside wall whose foot lies less than this under the ground level the ' +
      'site states stands at the ground; further down, it is named as lying below the ground.',
    basis: own
  },

  // ── Headroom under a sloped roof (LVL-6) ──────────────────────────────────────────────────
  headroomLow: {
    kind: 'limit',
    value: 1.5,
    unit: 'm',
    decides:
      "Grid's own size, not a code figure. The lower headroom band: a room's floor with at least " +
      'this much height over it, to its ceiling or the roof above it, is reported as one area.',
    basis: own
  },
  headroomFull: {
    kind: 'limit',
    value: 2.2,
    unit: 'm',
    decides:
      "Grid's own size, not a code figure. The upper headroom band: a room's floor with at least " +
      'this much height over it is reported as a second area.',
    basis: own
  },

  // ── A way through that a person fits (MSG-18) ─────────────────────────────────────────────
  passableWidth: {
    kind: 'limit',
    value: 0.4,
    unit: 'm',
    decides:
      'Grid\'s own size, not a code figure. A door or a doorless opening narrower than this is too narrow for a person to get through: ' +
      'it is named, and no route, way out or door to another room is read through it; ' +
      'outside floor closed in by walls and narrower than this is a gap between walls, not a courtyard (MSG-17).',
    basis: own
  },
  passableHeight: {
    kind: 'limit',
    value: 1.2,
    unit: 'm',
    decides:
      'Grid\'s own size, not a code figure. A door or a doorless opening lower than this is too ' +
      'low for a person to get through, even stooping: it is named and is not a way through.',
    basis: own
  },
  passableSill: {
    kind: 'limit',
    value: 0.3,
    unit: 'm',
    decides:
      'Grid\'s own size, not a code figure. A door or a doorless opening whose sill stands higher ' +
      'than this above its floor is not at the floor: it is named and is not a way through. Lower, ' +
      'it is a step.',
    basis: own
  },
  passableRise: {
    kind: 'limit',
    value: 0.3,
    unit: 'm',
    decides:
      'Grid\'s own size, not a code figure. A door or a doorless opening between two rooms whose ' +
      'floors stand further apart in height than this is not a way through without a stair (LVL-17): ' +
      'it is named with both levels, and no route is read through it. Lower, it is a step.',
    basis: own
  },
  // ── Fixtures (CNT-12) ─────────────────────────────────────────────────────────────────────
  itemIntoWall: {
    kind: 'tolerance',
    value: 0.005,
    unit: 'm',
    decides:
      'How far a fixture may reach into the body of a solid wall and still stand against its face. ' +
      'Past it, the fixture is named with the wall it runs into.',
    basis: own
  },
  // CNT-20: two items standing in each other, and the clear floor an item keeps.
  itemOverlap: {
    kind: 'tolerance',
    value: 0.005,
    unit: 'm',
    decides:
      'How far one item may reach into another, or into the clear floor another keeps in front of it, ' +
      'and still stand against it. Past it, both are named. ARE-73: the same for a fixture in an ' +
      'activity zone and for two activity zones that overlap.',
    basis: own
  },
  // CNT-21: an item hanging out of its room.
  itemLeavesRoom: {
    kind: 'tolerance',
    value: 0.005,
    unit: 'm²',
    decides:
      'How much of an item\'s floor may lie outside its room, where no wall stands, before it is ' +
      'named. Past it, the item is named with the room and the floor outside.',
    basis: own
  },
  itemRaised: {
    kind: 'tolerance',
    value: 1,
    unit: 'm',
    decides:
      'How high an item\'s underside may be above the floor and still stand on it. From it up, the ' +
      'item hangs above the plan\'s cut (a wall unit, a hood): it is drawn dashed, takes no floor and ' +
      'stands in no clear floor another keeps.',
    basis: own
  },
  itemAboveRoom: {
    kind: 'tolerance',
    value: 0.001,
    unit: 'm',
    decides:
      'How far a fixture may rise past the height of the room it stands in and still fit under the ' +
      'ceiling. Past it, the fixture is named with both heights.',
    basis: own
  },

  // ── Use indicators round the fixtures (CNT-13) ────────────────────────────────────────────
  // Measured on the plan, never a rule: each answer says what it measured and the width it set
  // it against, the person's own or one of these, named as Grid's own indicator.
  useOpenLeaf: {
    kind: 'limit',
    value: 0.05,
    unit: 'm',
    decides:
      'Grid\'s own size, not a code figure. What an open door leaf and its stop are taken to stand ' +
      'in its doorway: the clear width a door leaves is the hole in its wall less this. A doorless ' +
      'opening leaves its whole hole.',
    basis: own
  },
  useApproachDepth: {
    kind: 'limit',
    value: 0.3,
    unit: 'm',
    decides:
      'Grid\'s own size, not a code figure. How far in front of a doorway or a window a fixture ' +
      'counts as standing in it: one within this of the hole, across its width, narrows the ' +
      'doorway (`item/blocks-doorway`), or blocks the window when it stands higher than the sill ' +
      '(`item/blocks-window`).',
    basis: own
  },
  windowGlassKept: {
    kind: 'limit',
    value: 1.2,
    unit: 'm',
    decides:
      'Grid\'s own size, not a code figure. How much of a window\'s height must stay clear above ' +
      'a fixture standing in front of it for the window not to count as blocked: a fixture ' +
      'higher than the sill that leaves less than this of the glass clear blocks it ' +
      '(`item/blocks-window`).',
    basis: own
  },
  useDoorwayClear: {
    kind: 'limit',
    value: 0.8,
    unit: 'm',
    decides:
      'Grid\'s own size, not a code figure. The clear width a doorway is set against, as Grid\'s ' +
      'own indicator, when the person gives none.',
    basis: own
  },
  usePassageWidth: {
    kind: 'limit',
    value: 0.9,
    unit: 'm',
    decides:
      'Grid\'s own size, not a code figure. The width of the way through a room, between its ' +
      'doorways and clear of its fixtures, is set against this, as Grid\'s own indicator, when the ' +
      'person gives no body or trolley width.',
    basis: own
  },
  useTurningCircle: {
    kind: 'limit',
    value: 1.5,
    unit: 'm',
    decides:
      'Grid\'s own size, not a code figure. The turning circle tried in a room\'s free floor, as ' +
      'Grid\'s own indicator, when the person gives none.',
    basis: own
  },
  useClearSpace: {
    kind: 'limit',
    value: 0.6,
    unit: 'm',
    decides:
      'Grid\'s own size, not a code figure. The clear floor in front of and beside a fixture is set ' +
      'against this, as Grid\'s own indicator, when the person gives none.',
    basis: own
  },
  useRaster: {
    kind: 'tolerance',
    value: 0.02,
    unit: 'm',
    decides:
      'The step of the grid of points the way through a room is measured on: the widest body that ' +
      'gets from one doorway to another is found to within about this much.',
    basis: own
  },
  useRasterCells: {
    kind: 'limit',
    value: 250000,
    unit: 'count',
    decides:
      'The most points the way through one room is measured on. A room that would take more is ' +
      'measured on a coarser grid, and the answer gives the step it used.',
    basis: own
  },
  // ARE-25: a corridor's width from end to end.
  corridorRasterAcross: {
    kind: 'limit',
    value: 24,
    unit: 'count',
    decides:
      'The steps of the grid across a corridor\'s widest circle when its narrowest point from end ' +
      'to end is found, never finer than useRaster. The grid only finds where it is narrowest; ' +
      'the width there is taken from the walls themselves.',
    basis: own
  },
  corridorEndTurn: {
    kind: 'tolerance',
    value: 0.5236,
    unit: 'radian',
    decides:
      'A side of a corridor\'s outline is one of its ends when the outline turns into the ' +
      'corridor by at least this (30 degrees) at both its corners; a jog in a side and the ' +
      'straight pieces of a curve are never an end.',
    basis: own
  },

  // ── A step inside a floor (LVL-7) ─────────────────────────────────────────────────────────
  sameFloorLevel: {
    kind: 'tolerance',
    value: 0.005,
    unit: 'm',
    decides:
      'Two rooms side by side whose floors stand closer than this in height share a level: no step ' +
      'is drawn between them. So do two floors that state their elevations (LVL-11): neither is ' +
      'set against the other as a floor below it.',
    basis: own
  },
  floorOffsetLargest: {
    kind: 'limit',
    value: 1.5,
    unit: 'm',
    decides:
      'A room set further than this above or below its storey is asked about: so far off, it is more ' +
      'likely a floor of its own, a half level or a mezzanine.',
    basis: own
  },

  // ── Stairs and lifts (LVL-3) ──────────────────────────────────────────────────────────────
  stairRoomOverlap: {
    kind: 'tolerance',
    value: 0.5,
    unit: 'ratio',
    decides:
      'Two rooms used as a stair (or as a lift) on neighbouring floors are one stair (or one shaft) ' +
      'when they share at least this of the smaller one, and the way-out check goes up and down ' +
      'it. Stair rooms on both floors that share less are named as out of line. The lab found ' +
      'every sound pair at or above this and every planted fault below it (AU3-1).',
    basis: own
  },
  stackShift: {
    kind: 'tolerance',
    value: 0.05,
    unit: 'm',
    decides:
      'How far a floor, a stair room or a lift shaft may stand off the one below it and still line ' +
      'up with it (LVL-5, lab WR-9): a floor whose outline reaches past the floor below, or sits ' +
      'back from it, by more than this and half the thickest wall that stretch runs along is said ' +
      'not to line up (walls of different thickness on one axis have their faces apart by up to ' +
      'that), and so is a stair room or a shaft moved by more than this from the one it lies ' +
      'over, unless the plan marks it as meant. A lower floor lies under a floor only where their ' +
      'outlines share more than this and the whole of the thickest wall along that share (LVL-11): ' +
      'two halves of a split level overlap by the wall between them, and neither is under the other.',
    basis: own
  },
  stairStepLength: {
    kind: 'limit',
    value: 0.63,
    unit: 'm',
    decides:
      'How a stair that states no number of risers is laid out: Grid takes the number that brings ' +
      'twice the riser plus the going nearest this length, the stride of a person on a stair. It ' +
      'only lays the stair out; it judges no riser and no going.',
    basis: own
  },
  stairSnap: {
    kind: 'tolerance',
    value: 0.05,
    unit: 'm',
    decides:
      'A flight or landing drawn in a section within this of a wall or a slab it faces is drawn ' +
      'touching it, so the cut is one outline with no sliver of white between them (VEW-57). It ' +
      'only draws the stair; it judges nothing.',
    basis: own
  },
  stairWaist: {
    kind: 'limit',
    value: 0.15,
    unit: 'm',
    decides:
      'How thick a flight of stairs is drawn in a section, under the roots of its steps and square ' +
      'to its slope, and how thick a landing is, at least one riser (VEW-11): the plan states no ' +
      'waist. It only draws the stair; it judges nothing.',
    basis: own
  },

  // ── The plan as drawn (SHT-11) ────────────────────────────────────────────────────────────
  planCutHeight: {
    kind: 'limit',
    value: 1.2,
    unit: 'm',
    decides:
      'How high above a floor its plan is cut. A stair that climbs from the floor is drawn solid ' +
      'up to where its flight reaches this height, with a break line across it there, and dashed ' +
      'above. It only draws the plan; it judges nothing.',
    basis: own
  },
  plinthLeast: {
    kind: 'tolerance',
    value: 0.005,
    unit: 'm',
    decides:
      'A floor on the ground whose slab stands less than this above the ground the site states ' +
      'stands at the ground; higher, its sections and facades carry its walls down to the ground ' +
      'on a plinth (VEW-16). It only draws; it judges nothing.',
    basis: own
  },
  sectionEarthBelow: {
    kind: 'limit',
    value: 1,
    unit: 'm',
    decides:
      'How far below the lowest thing a section cuts under the ground, or below the ground where ' +
      'it cuts nothing there, the earth is drawn (VEW-65). It only draws the section; it judges nothing.',
    basis: own
  },
  elevationMarkOffset: {
    kind: 'limit',
    value: 1.2,
    unit: 'm',
    decides:
      'How far outside the drawing and its dimensions an elevation mark stands on a plan (LVL-9). ' +
      'It only draws the mark; it judges nothing.',
    basis: own
  },
  aboveSameEdge: {
    kind: 'tolerance',
    value: 0.02,
    unit: 'm',
    decides:
      'A stretch of the outline of the floor above that lies within this of the outline of the ' +
      'floor drawn, along it, is the same wall face seen twice, and is not drawn dashed as what ' +
      'lies above.',
    basis: own
  },

  // ── Kinds of door and window (CNT-14) ─────────────────────────────────────────────────────
  wideSingleLeaf: {
    kind: 'limit',
    value: 1.5,
    unit: 'm',
    decides:
      'A door at least this wide that states no kind is taken as one swinging leaf, as every door ' +
      'without one is, and is asked about (`opening/wide-single-leaf`): a leaf this wide is rare, ' +
      'and the door may be a pair, a sliding, folding, roller or garage door. It only asks.',
    basis: own
  },
  foldingPanel: {
    kind: 'limit',
    value: 0.6,
    unit: 'm',
    decides:
      'The widest panel a folding door is drawn and checked with: it folds in as many panels as ' +
      'this needs, two at least, and sweeps a strip as deep as one panel on the face it opens to.',
    basis: own
  },
  frameFace: {
    kind: 'limit',
    value: 0.05,
    unit: 'm',
    decides:
      'How wide the frame round a door or window, and round each part of a window that opens, is ' +
      'drawn in 3D, and each side\'s frame on a plan drawn in detail (SHT-10). The plan holds no ' +
      'frame: it only draws the model and the plan.',
    basis: own
  },
  frameDepth: {
    kind: 'limit',
    value: 0.07,
    unit: 'm',
    decides:
      'How deep a window\'s frame is drawn in 3D and on a plan drawn in detail (SHT-10), in the ' +
      'middle of its wall (no deeper than the wall). A door\'s frame lines the whole depth of its ' +
      'wall. It only draws the model and the plan.',
    basis: own
  },
  leafThickness: {
    kind: 'limit',
    value: 0.04,
    unit: 'm',
    decides:
      'How thick a door leaf or panel is drawn in 3D, hung from the face of the wall it opens ' +
      'toward. It only draws the model.',
    basis: own
  },
  glassThickness: {
    kind: 'limit',
    value: 0.02,
    unit: 'm',
    decides:
      'How thick a window\'s glass is drawn in 3D, in the middle of its frame, and how far apart its ' +
      'two panes are drawn on a plan drawn in detail (SHT-10). It only draws the model and the plan.',
    basis: own
  },
  floorLift: {
    kind: 'limit',
    value: 0.005,
    unit: 'm',
    decides:
      'How far a room\'s floor is raised above the slab it stands on in an OBJ or GLB (VEW-73), so ' +
      'the two never share a plane and flicker in a viewer. It only draws the model.',
    basis: own
  },
  // VEW-82: a GLB made for a game engine or a renderer.
  wallPieceShortest: {
    kind: 'limit',
    value: 0.05,
    unit: 'm',
    decides:
      'The shortest piece a GLB writes a wall split at the rooms beside it as: a stretch between ' +
      'two rooms\' corners shorter than this joins the piece before it. It only splits the model.',
    basis: own
  },
  doorOpenAngle: {
    kind: 'limit',
    value: 90,
    unit: 'degree',
    decides: 'How far a GLB written with its doors open turns each swinging leaf on its hinge. It only draws the model.',
    basis: own
  },
  cameraNear: {
    kind: 'limit',
    value: 0.05,
    unit: 'm',
    decides: 'How near a GLB\'s camera, made from a saved view, starts to see (its near plane). It only draws the model.',
    basis: own
  },
  // VEW-78: a room's side lies on a wall's face, for the lining its finish is drawn on in 3D.
  liningOnFace: {
    kind: 'tolerance',
    value: 0.02,
    unit: 'm',
    decides:
      'How far a side of a room\'s inside outline may be from a wall\'s face and still be drawn as ' +
      'that face, tinted by the room\'s wall finish in 3D. It only draws the model.',
    basis: own
  },
  liningOffset: {
    kind: 'limit',
    value: 0.002,
    unit: 'm',
    decides:
      'How far into the room a wall finish is drawn off its wall\'s face in 3D, and a ceiling under ' +
      'the slab above, so each shows over the surface it covers; a band is drawn twice as far. It ' +
      'only draws the model.',
    basis: own
  },
  sillProjection: {
    kind: 'limit',
    value: 0.03,
    unit: 'm',
    decides:
      'How far a window\'s sill stands out from each face of its wall, and past each side of its ' +
      'hole, on a plan drawn in detail (SHT-10). The plan holds no sill: it only draws the plan.',
    basis: own
  },
  // ── Facades and opening patterns (LVL-8) ──────────────────────────────────────────────────
  facadeFacing: {
    kind: 'tolerance',
    value: 0.0175,
    unit: 'sine',
    decides:
      'A face of the building is drawn on a facade when it turns at least this much toward the ' +
      'side the facade is seen from (about one degree): a face edge-on to it, or turned away, is ' +
      'not seen.',
    basis: own
  },
  facadeOnFace: {
    kind: 'tolerance',
    value: 0.01,
    unit: 'm',
    decides:
      'A wall whose outside face lies within this of a stretch of the floor\'s outline is the wall ' +
      'that stretch of the facade shows, with its height and its openings.',
    basis: own
  },
  facadeRoofProjection: {
    kind: 'limit',
    value: 0.3,
    unit: 'm',
    decides:
      'How far a pitched roof is drawn past its outside walls in elevation (VEW-71). The plan holds no overhang dimension.',
    basis: own
  },
  facadeSameDepth: {
    kind: 'tolerance',
    value: 0.05,
    unit: 'm',
    decides:
      'Faces of a facade that stand within this of each other, front to back, are drawn as one ' +
      'plane, with one line weight; a face set back further is drawn lighter.',
    basis: own
  },
  facadeSillDepth: {
    kind: 'limit',
    value: 0.05,
    unit: 'm',
    decides:
      'How deep a window\'s sill is drawn on a facade, under its hole, running past each side of ' +
      'it as far as the sill stands out on a plan drawn in detail (VEW-63). The plan holds no sill: ' +
      'it only draws the facade.',
    basis: own
  },
  facadeHeadDepth: {
    kind: 'limit',
    value: 0.15,
    unit: 'm',
    decides:
      'How deep a window\'s head is drawn on a facade, over its hole and as wide as it, and no ' +
      'higher than the wall it is in (VEW-63). The plan holds no head: it only draws the facade.',
    basis: own
  },

  // ── Columns and structural grids (CNT-16) ─────────────────────────────────────────────────
  columnRoundPieces: {
    kind: 'limit',
    value: 32,
    unit: 'count',
    decides:
      'How many straight sides a round column is drawn and exported with, and cut to its room ' +
      'with; its own area, and what it takes off a room it stands wholly in, is the true circle\'s.',
    basis: own
  },
  gridLinesMost: {
    kind: 'limit',
    value: 100,
    unit: 'count',
    decides: 'The most lines one set of a structural grid may have; a set with more is refused.',
    basis: own
  },
  // MSG-34: how many room names say the person's language before a write records it.
  languageNamesLeast: {
    kind: 'limit',
    value: 2,
    unit: 'count',
    decides:
      'The fewest room names that are one language\'s word for a use, and none another\'s, before ' +
      'writing rooms text records that language as the plan\'s own.',
    basis: own
  },
  gridOverrun: {
    kind: 'limit',
    value: 1.5,
    unit: 'm',
    decides:
      'How far a structural grid\'s lines are drawn past the outermost line across them, where ' +
      'their names are written and their spacing is dimensioned.',
    basis: own
  },
  // WRT-83: a radial grid's rings, drawn as arcs.
  gridArcStep: {
    kind: 'limit',
    value: 5,
    unit: 'degree',
    decides:
      'The widest turn one straight piece of a radial grid\'s ring is drawn and exported with; a ' +
      'ring that is not whole stops this much short of closing at most.',
    basis: own
  },

  // ── Parking bays and ramps (CNT-19) ───────────────────────────────────────────────────────
  bayOverlap: {
    kind: 'tolerance',
    value: 0.01,
    unit: 'm²',
    decides:
      'Two parking bays of one floor that share more floor than this overlap: each is still ' +
      'counted, and the warning says the floor holds fewer bays than it counts.',
    basis: own
  },
  rampSlopeDiffers: {
    kind: 'tolerance',
    value: 0.5,
    unit: '%',
    decides:
      'A ramp\'s stated slope further than this, in percentage points, from the slope its two ' +
      'levels and its run give is worth a look; both are kept and returned.',
    basis: own
  },

  // ── The sun and its shadows (CNT-58) ──────────────────────────────────────────────────────
  sunLowest: {
    kind: 'tolerance',
    value: 0.5,
    unit: 'degree',
    decides:
      'The sun lower than this above the horizon casts no shadow Grid works out: everything is ' +
      'taken as in shade, as a shadow that low runs on past any plot.',
    basis: own
  },
  sunStepMinutes: {
    kind: 'limit',
    value: 30,
    unit: 'minute',
    decides:
      'The time between the moments the sun is worked out at over a range of hours, when the ' +
      'call gives none.',
    basis: own
  },
  sunStepDays: {
    kind: 'limit',
    value: 7,
    unit: 'day',
    decides:
      'The days between the dates the sun is worked out on over a range of dates, when the call ' +
      'gives none; the last date is always one of them.',
    basis: own
  },
  sunMomentsMost: {
    kind: 'limit',
    value: 2000,
    unit: 'count',
    decides:
      'The most moments one call works the sun and its shadows out at: dates times hours; more is ' +
      'refused with the step that fits.',
    basis: own
  },
  sunFaceFoot: {
    kind: 'tolerance',
    value: 0.05,
    unit: 'm',
    decides:
      'How far in front of a building face its foot is taken, to say how much of it lies in the ' +
      'shadow of something else, clear of the face\'s own corner.',
    basis: own
  },
  sunFaceShortest: {
    kind: 'tolerance',
    value: 0.5,
    unit: 'm',
    decides:
      'A straight stretch of a building\'s outline shorter than this is no face of its own when the ' +
      'sun on the faces is said: the step where walls of two thicknesses meet, or a corner made good.',
    basis: own
  },
  fenceCasts: {
    kind: 'tolerance',
    value: 0.05,
    unit: 'm',
    decides:
      'The thickness a site fence with a height is taken as when it casts a shadow, as the site ' +
      'states its line alone.',
    basis: own
  },
  treeCrownBase: {
    kind: 'tolerance',
    value: 0.4,
    unit: 'ratio',
    decides:
      'Where a tree\'s crown starts, as a share of its height, when it casts a shadow: its canopy ' +
      'is taken as a disc of that width from there to its top, and its trunk casts none.',
    basis: own
  },
  canopySides: {
    kind: 'limit',
    value: 24,
    unit: 'count',
    decides: 'The straight sides a tree\'s round canopy is traced with when it casts a shadow.',
    basis: own
  },

  // ── The site drawn in 3D (CNT-60) ─────────────────────────────────────────────────────────
  siteLift: {
    kind: 'limit',
    value: 0.02,
    unit: 'm',
    decides:
      'How far paving, a path and a neighbour with no height are raised above the ground in the 3D ' +
      'views and the GLB, so the two never share a plane and flicker. It only draws the model.',
    basis: own
  },
  fenceDrawnHeight: {
    kind: 'limit',
    value: 1.2,
    unit: 'm',
    decides: 'How high a fence or a gate that states no height is drawn in the 3D views and the GLB. It only draws the model.',
    basis: own
  },
  fenceDrawnThickness: {
    kind: 'limit',
    value: 0.05,
    unit: 'm',
    decides: 'How thick a fence or a gate is drawn in the 3D views and the GLB, as the site states its line alone.',
    basis: own
  },
  treeDrawnHeight: {
    kind: 'limit',
    value: 6,
    unit: 'm',
    decides: 'How high a tree that states no height is drawn in the 3D views and the GLB. It only draws the model.',
    basis: own
  },
  treeDrawnCanopy: {
    kind: 'limit',
    value: 4,
    unit: 'm',
    decides: 'How wide a tree\'s crown is drawn in the 3D views and the GLB when it states no canopy.',
    basis: own
  },
  treeDrawnTrunk: {
    kind: 'limit',
    value: 0.3,
    unit: 'm',
    decides: 'How wide a tree\'s trunk is drawn in the 3D views and the GLB.',
    basis: own
  },
  poolDrawnDepth: {
    kind: 'limit',
    value: 1.5,
    unit: 'm',
    decides: 'How deep a pool is drawn below the ground in the 3D views and the GLB, as the site states its edge alone.',
    basis: own
  },
  poolWaterBelowEdge: {
    kind: 'limit',
    value: 0.15,
    unit: 'm',
    decides: 'How far below the ground a pool\'s water is drawn in the 3D views and the GLB, so it reads as sunk into the ground.',
    basis: own
  },

  // ── Limits: refused ───────────────────────────────────────────────────────────────────────
  largest: {
    kind: 'limit',
    value: 1e7,
    unit: 'm',
    decides:
      'The largest coordinate or size Grid accepts. Past it a number is no building, the ' +
      'arithmetic loses the precision the checks need, and the part is refused. A number too ' +
      'large to hold at all (it reads as infinity) is refused by the schema.',
    basis: own
  },
  farFromOrigin: {
    kind: 'limit',
    value: 500,
    unit: 'm',
    decides:
      'A plan reaching further than this from its origin gets a warning: most likely a scale or ' +
      'unit error. The origin is the site\'s, where the plan states one (HND-11), else (0, 0).',
    basis: own
  },
  // VEW-3: a camera an agent sets. Past these a view call, or a saved view, is refused.
  cameraTilt: {
    kind: 'limit',
    value: 89,
    unit: 'degree',
    decides:
      'How far a camera may look down at, or up to, what it is pointed at, from level. Looking ' +
      'straight down or up, a picture has no up, so a camera turned further is refused.',
    basis: own
  },
  cameraClosest: {
    kind: 'limit',
    value: 0.1,
    unit: 'm',
    decides: 'The least distance from a camera to what it is pointed at. Closer, the picture shows nothing of it.',
    basis: own
  },
  lensShortest: {
    kind: 'limit',
    value: 8,
    unit: 'mm',
    decides: 'The shortest focal length a camera may have, on a 36 by 24 mm sensor: about 132 degrees across. Shorter is refused.',
    basis: own
  },
  lensLongest: {
    kind: 'limit',
    value: 800,
    unit: 'mm',
    decides: 'The longest focal length a camera may have, on a 36 by 24 mm sensor: under 3 degrees across. Longer is refused.',
    basis: own
  },

  // ── Limits: plausibility questions ────────────────────────────────────────────────────────
  wallThinnest: {
    kind: 'limit',
    value: 0.02,
    unit: 'm',
    decides: 'A solid wall thinner than this is questioned: most likely a slipped digit or unit, or a line that should be virtual.',
    basis: own
  },
  wallThickest: {
    kind: 'limit',
    value: 3,
    home: 1.5,
    unit: 'm',
    decides: 'A wall thicker than this is questioned.',
    basis: own
  },
  wallLowest: {
    kind: 'limit',
    value: 0.1,
    unit: 'm',
    decides: 'A solid wall lower than this is questioned.',
    basis: own
  },
  wallHighest: {
    kind: 'limit',
    value: 40,
    home: 10,
    hall: 80,
    unit: 'm',
    decides: 'A wall higher than this is questioned. Grid stands a storey on its tallest wall.',
    basis: own
  },
  wallBalustradeHighest: {
    kind: 'limit',
    value: 2,
    unit: 'm',
    decides:
      'A solid wall lower than this is a balustrade, parapet or rail, a little under a door: it is left out of ' +
      'what the typical wall of its floor is.',
    basis: own
  },
  wallHigherThanTypical: {
    kind: 'limit',
    value: 4,
    unit: 'ratio',
    decides:
      'A wall this many times higher than the typical solid wall on its floor is questioned, ' +
      'when the floor has at least three other solid walls.',
    basis: own
  },
  openingNarrowest: {
    kind: 'limit',
    value: 0.2,
    unit: 'm',
    decides:
      'An opening narrower than this is questioned. Whether a door is a way through is ' +
      '`passableWidth`.',
    basis: own
  },
  openingLowest: {
    kind: 'limit',
    value: 0.2,
    unit: 'm',
    decides: 'An opening lower than this is questioned.',
    basis: own
  },
  // LVL-18: a storey a person cannot stand in, and a low door onto a stair or a lift.
  storeyLowest: {
    kind: 'limit',
    value: 2,
    unit: 'm',
    decides:
      "Grid's own size, not a code figure. A storey lower than this is questioned: a floor that " +
      'states a lower height, or one under another floor that states none and whose tallest wall is ' +
      'lower. A floor under a roof of its own is asked about below `wallLowest` only. A wall lower ' +
      'than this is no storey high, so its own height is not set against its floor\'s (LVL-24).',
    basis: own
  },
  stairDoorLowest: {
    kind: 'limit',
    value: 1.8,
    unit: 'm',
    decides:
      "Grid's own size, not a code figure. A door or a doorless opening onto a room used as a stair " +
      'or a lift lower than this is questioned.',
    basis: own
  },
  roomLargest: {
    kind: 'limit',
    value: 50000,
    home: 1000,
    hall: 500000,
    unit: 'm²',
    decides: 'A room larger than this is questioned.',
    basis: own
  },
  homeRoomSmallest: {
    kind: 'limit',
    value: 4,
    unit: 'm²',
    decides:
      "Grid's own size, not a code figure. A bedroom, living room or dining room of a home with less " +
      'net floor than this is asked about after the check, with no place or country needed (ARE-72).',
    basis: own
  },
  homeRoomNarrowest: {
    kind: 'limit',
    value: 1.8,
    unit: 'm',
    decides:
      "Grid's own size, not a code figure. A bedroom, living room or dining room of a home whose widest " +
      'circle, as grid_measure gives it, is narrower than this is asked about after the check (ARE-72).',
    basis: own
  },
  homeWetRoomSmallest: {
    kind: 'limit',
    value: 0.8,
    unit: 'm²',
    decides:
      "Grid's own size, not a code figure. A kitchen, bathroom or toilet of a home with less net floor " +
      'than this is asked about after the check (ARE-72).',
    basis: own
  },
  homeWetRoomNarrowest: {
    kind: 'limit',
    value: 0.6,
    unit: 'm',
    decides:
      "Grid's own size, not a code figure. A kitchen, bathroom or toilet of a home whose widest circle " +
      'is narrower than this is asked about after the check (ARE-72).',
    basis: own
  },
  typicalHeightLowest: {
    kind: 'limit',
    value: 1.8,
    unit: 'm',
    decides:
      'The units question. When the typical solid wall of a plan is outside `typicalHeightLowest` to ' +
      '`typicalHeightHighest` but inside it read in feet, inches, centimetres or millimetres, and the ' +
      'typical thickness (and door width, when there are doors) agrees, Grid asks whether the ' +
      'plan was typed in that unit.',
    basis: own
  },
  typicalHeightHighest: {
    kind: 'limit',
    value: 6,
    hall: 30,
    unit: 'm',
    decides: 'For the units question: the highest typical solid wall that reads as a storey in metres (see `typicalHeightLowest`).',
    basis: own
  },
  typicalThicknessLowest: {
    kind: 'limit',
    value: 0.08,
    unit: 'm',
    decides: 'For the units question: the thinnest typical solid wall that agrees with a unit.',
    basis: own
  },
  typicalThicknessHighest: {
    kind: 'limit',
    value: 1,
    unit: 'm',
    decides: 'For the units question: the thickest typical solid wall that agrees with a unit.',
    basis: own
  },
  typicalDoorLowest: {
    kind: 'limit',
    value: 0.5,
    unit: 'm',
    decides: 'For the units question: the narrowest typical door that agrees with a unit.',
    basis: own
  },
  typicalDoorHighest: {
    kind: 'limit',
    value: 2.5,
    unit: 'm',
    decides: 'For the units question: the widest typical door that agrees with a unit.',
    basis: own
  },
  // WRT-22: a room's side written rooms first, and an opening an edit makes.
  roomsSideAsked: {
    kind: 'limit',
    value: 200,
    home: 50,
    hall: 1000,
    unit: 'm',
    decides:
      'A room side written rooms first as a bare number, stretched with * or drawn as a polygon, ' +
      'longer than this is asked about: it is drawn in metres, and may have been millimetres or ' +
      'feet. A length written with its unit is taken as meant, at any size.',
    basis: own
  },
  roomsSideBare: {
    kind: 'limit',
    value: 2000,
    unit: 'm',
    decides:
      'A room side written rooms first as a bare number longer than this is refused: it is no ' +
      'building in metres, and most likely millimetres. Written with its unit, it is taken.',
    basis: own
  },
  openingWidest: {
    kind: 'limit',
    value: 1000,
    unit: 'm',
    decides:
      'The widest door, window or opening an edit takes. Below it the wall decides: an opening ' +
      'that does not fit its wall or room side is refused with the stretches that are free.',
    basis: own
  },
  traceUnscaled: {
    kind: 'limit',
    value: 0.01,
    unit: 'm',
    decides: 'A trace image with no scale of its own is drawn at this many metres a pixel, and said to be unscaled (HND-10).',
    basis: own
  },
  lintelBearing: {
    kind: 'limit',
    value: 0.15,
    unit: 'm',
    decides: 'The bearing taken at each end of a lintel over a new opening cut through a wall that stays, when the work is costed: the plan holds no lintels, so the line is marked assumed (ARE-71).',
    basis: own
  },

  // ── Arithmetic: rounding noise, not adjustable ────────────────────────────────────────────
  noLength: {
    kind: 'arithmetic',
    value: 1e-9,
    unit: 'm',
    decides:
      'A length, a height or a distance along a line below this is none: a wall piece, a step or ' +
      'a direction of travel this short is rounding noise.',
    basis: own
  },
  lengthEqual: {
    kind: 'arithmetic',
    value: 1e-9,
    unit: 'm',
    decides:
      'A length this close to the figure it is checked against is that figure (ARE-7): a width ' +
      'drawn at exactly the figure is never read as a hair under it. Areas use `areaEqual`.',
    basis: own
  },
  noArea: {
    kind: 'arithmetic',
    value: 1e-12,
    unit: 'm²',
    decides: 'An area or a cross product below this is none: a triangle, a clipped piece or a turn this small is rounding noise.',
    basis: own
  },
  onLine: {
    kind: 'arithmetic',
    value: 1e-9,
    unit: 'm²',
    decides: 'A cross product below this puts a point on the line through two others.',
    basis: own
  },
  parallel: {
    kind: 'arithmetic',
    value: 1e-9,
    unit: 'sine',
    decides: 'Two directions whose sine is below this are parallel: their lines do not cross.',
    basis: own
  },
  samePoint: {
    kind: 'arithmetic',
    value: 1e-9,
    unit: 'm',
    decides: 'Points closer than this are one vertex when floors are cut into triangles.',
    basis: own
  },
  sameAngle: {
    kind: 'arithmetic',
    value: 1e-9,
    unit: 'radian',
    decides: 'Angles closer than this are one when floors are cut into triangles.',
    basis: own
  },
  noTurn: {
    kind: 'arithmetic',
    value: 1e-6,
    unit: 'sine',
    decides: 'Below this, the pivot of a wall that moved between two versions is so far away that it is noise: the wall was reshaped, not turned.',
    basis: own
  },
  joint: {
    kind: 'arithmetic',
    value: 1e-6,
    unit: 'm',
    decides: 'Ends of two walls closer than this are one joint, and two heights closer than this are one in the 3D build.',
    basis: own
  },
  roomsWritten: {
    kind: 'arithmetic',
    value: 1e-4,
    unit: 'm',
    decides:
      'Rooms text and the plans written from it hold lengths to a tenth of a millimetre, so two ' +
      'lengths that agree to this are the same when a read-back is checked by writing it again.',
    basis: own
  },
  scanWritten: {
    kind: 'arithmetic',
    value: 1e-6,
    unit: 'm',
    decides:
      'A plan written from a phone room scan (HND-12) holds its walls to a micrometre, so each ' +
      'room keeps the area the scan gives it to far better than a thousandth of a per cent.',
    basis: own
  },
  lineHalfWidth: {
    kind: 'arithmetic',
    value: 1e-9,
    unit: 'm',
    decides:
      'Half the width a dividing line is given near the origin when spaces are worked out. It ' +
      'grows with the distance from the origin, so it never falls below what a number there can ' +
      'tell apart.',
    basis: own
  },
  relativeNoise: {
    kind: 'arithmetic',
    value: 1e-9,
    unit: 'ratio',
    decides: 'What a double can tell apart relative to the size it is measured against.',
    basis: own
  },
  farNoise: {
    kind: 'arithmetic',
    value: 1e-14,
    unit: 'ratio',
    decides: 'The share of the plan\'s reach a dividing line is widened by, so far from the origin it still has a width a double can hold.',
    basis: own
  },
  noSlope: {
    kind: 'arithmetic',
    value: 1e-15,
    unit: 'ratio',
    decides: 'A slope below this is none when a segment is clipped.',
    basis: own
  },
  sliverArea: {
    kind: 'arithmetic',
    value: 1e-5,
    unit: 'm²',
    decides:
      'A hole in the joined cut of a section smaller than this is a hair left where two parts ' +
      'almost meet, not a room (VEW-57), and is not drawn.',
    basis: own
  },
  shellGrid: {
    kind: 'arithmetic',
    value: 1e-6,
    unit: 'm',
    decides:
      'The corners of a slab, a roof and a parapet are drawn and exported rounded to this grid: the ' +
      'join of the walls leaves each corner of an outline a hair off square, and this puts it square.',
    basis: own
  },
  joinGrids: {
    kind: 'arithmetic',
    values: [0, 1e-9, 1e-7, 1e-6, 1e-5],
    unit: 'm',
    decides:
      'The polygon library can fail to close a ring when two edges almost coincide. A join of ' +
      'walls or rooms is tried as drawn, then with every point rounded to these grids, coarsest ' +
      'last.',
    basis: own
  },
  overlapGrids: {
    kind: 'arithmetic',
    values: [0, 1e-9, 1e-7, 1e-6],
    unit: 'm',
    decides: 'The same, for cutting two rooms to see how much floor they share.',
    basis: own
  }
} as const satisfies Record<string, ToleranceEntry | GridsEntry>

type Table = typeof TOLERANCES

/** The entries that hold one number. */
export type ToleranceName = {
  [K in keyof Table]: Table[K] extends { readonly value: number } ? K : never
}[keyof Table]

/** The entries a survey may adjust: every one that is not arithmetic. */
export type AdjustableName = {
  [K in ToleranceName]: Table[K]['kind'] extends 'arithmetic' ? never : K
}[ToleranceName]

export type ToleranceChanges = Partial<Record<AdjustableName, number>>

/** The changes in force, if any (`withTolerances`). */
let active: ToleranceChanges | null = null

/** The value in force for one entry: the table's, or the change in force. */
export function tolerance(name: ToleranceName): number {
  const changed = active === null ? undefined : (active as Partial<Record<ToleranceName, number>>)[name]
  return changed ?? TOLERANCES[name].value
}

/** A limit for a kind of building: its `home` figure in a home and its `hall` figure in a hall, when it has one. */
export function limit(name: ToleranceName, building: BuildingKind = 'any'): number {
  const changed = active === null ? undefined : (active as Partial<Record<ToleranceName, number>>)[name]
  if (changed !== undefined) return changed
  const entry: ToleranceEntry = TOLERANCES[name]
  if (building === 'home' && entry.home !== undefined) return entry.home
  if (building === 'hall' && entry.hall !== undefined) return entry.hall
  return entry.value
}

/** Whether every entry has its value from the table (no `withTolerances` change is in force). */
export function tolerancesAsStated(): boolean {
  return active === null
}

/** CMD-51: whether a call has the table changed (`withTolerances`), so nothing worked out now is kept. */
export function tolerancesChanged(): boolean {
  return active !== null
}

/**
 * Runs `run` with some entries changed, for a survey or a scan that is less exact than a drawing.
 * A change replaces the entry for every kind of building. Only `tolerance` and `limit` entries
 * may change, each to a positive finite number; anything else throws a `RangeError` before
 * `run` starts. Changes nest: an inner call changes what the outer left in force.
 */
export function withTolerances<T>(changes: ToleranceChanges, run: () => T): T {
  for (const [name, value] of Object.entries(changes)) {
    const entry = (TOLERANCES as Record<string, ToleranceEntry | GridsEntry>)[name]
    if (entry === undefined) throw new RangeError(`There is no tolerance named ${JSON.stringify(name)}`)
    if (entry.kind === 'arithmetic') {
      throw new RangeError(`${name} guards against rounding noise and cannot be adjusted`)
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive finite number, not ${String(value)}`)
    }
  }
  const before = active
  active = { ...(before ?? {}), ...changes }
  try {
    return run()
  } finally {
    active = before
  }
}
