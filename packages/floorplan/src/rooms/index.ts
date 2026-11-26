/**
 * Writing a plan rooms first, and reading any plan back as rooms text (WRT-2). The plan file is
 * the source of truth; the rooms text is a way of writing and reading it.
 */
export { compileRoomsText, SIZE_BASES, type CompileOptions, type DerivedWallFacts, type RoomFacts, type RoomsFix, type RoomsProblem, type RoomsResult, type SizeBasis } from './compile'
export { layOut, LAYOUT_SHAPES, LayoutRefused, type Layout, type LayoutRequest, type LayoutRoom, type LayoutShape, type LayoutTouch, type PlacedRoom } from './layout'
export { readRoomsText, type ReadOptions, type RoomsReading } from './read'
export { problemLines, roomsAnswer } from './answer'
export { boundariesEdited, boundaryPrint, keptDerived, planRevision, stampFor, type WrittenStamp } from './stamp'
export { carryFacts, type FactsCarried } from './facts'
export { plainIdsFor, withPlainIds } from './ids'
export { DRAWING_SIDES, edgeSides, edgesFacing, northOfWords, northWordsOf, NORTH_WAYS, plotCorners, setbackOfWords, siteEdges, siteLines, streetsOfWords, thingOfWords, turnOf, writtenSite, type SetbackWords } from './site'
export { layStair, stairLine, stairLines, stairOfWords, stairSummary, stairWordsOf, StairLines, StairRefused, STAIR_SHAPES, STAIR_WAYS, type StairMade, type StairShape, type StairWay, type StairWords } from './stairs'
export { ITEM_LINE_WORDS, ITEM_SIDES, itemLine, itemLines, ItemLines, itemOfWords, ItemRefused, itemsFollowWalls, itemWordsAgainst, placeItem, RAW_ITEM_KINDS, type ClearSides, type ItemMade, type ItemSide, type ItemWords } from './items'
export { itemAndRowLines, layRow, rowItemId, itemRowLine, rowOfWords, ROW_LINE_WORDS, type RowWords } from './rows'
export { BAY_AISLE, BAY_KINDS, BAY_ROWS, BAY_SIZES, BAYS_MOST, baysOfWords, baysSummary, bayOfWords, helixRun, layBay, layBays, layRamp, numberAfter, numbersSaid, parkingLines, ParkingLines, ParkingRefused, PARKING_WAYS, rampLine, rampOfWords, rampSummary, rampWordsOf, rowBays, rowLine, type BayKind, type BayRows, type BaysMade, type BaysWords, type BayWords, type ParkingWay, type RampMade, type RampWords, type RowSpec } from './parking'
export { givenIds, isAnnotation, noteLines, NoteLines, noteOfLine, noteOfWords, notePart, notePlaceOf, notePlaceText, NoteRefused, notesSummary, noteWhat, NOTE_KINDS, NOTE_LINE_WORDS, placedLine, ROUTE_CATEGORY, routeHead, routeShaft, type NoteKind, type NotePlace, type NoteWords } from './notes'
export { baseNamedIn, fitOutReading, ownParts, restOnBase, BASE_LINE_WORDS, type BasePlan } from './base'
