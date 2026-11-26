/**
 * MSG-11: Grid's own sentences come from the message files (`packages/floorplan/src/messages`),
 * one per language, and nowhere else. This test reads every user-facing source file of the four
 * packages and counts the string literals that look like an English sentence: three or more
 * words in a row. A file not listed below must have none; a listed file must have exactly the
 * count it is listed with, so a new sentence fails the test and a moved one asks for its count
 * to come down. The list is what is left to move, by kind (`WHY`), and `reviews/MSG-11.md` lists
 * it for the owner.
 *
 * Move a sentence by giving it a key in `en.ts` and every other language's file and saying it
 * with `say` (`docs/languages.md`).
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, resolve } from 'path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../..')
const PACKAGES = ['floorplan', 'rules', 'viewer', 'cli']

/** Why a file still holds English sentences. */
const WHY = {
  tools: "The tool server's tools: their descriptions and argument schemas are for the agent and stay in English by design (the agent retells the coded results in the person's language). grid_check, grid_describe, grid_view and grid_sheet answer in the language asked for; the other tools' answers are not moved yet.",
  agent: 'Written for the agent, not the person: the protocol, the argument checks, the retelling rules and the lookup prompt. English by design.',
  command: "The command line's help, usage and refusals of a mistyped command. Not moved yet.",
  developer: "For people who build or install Grid: the tolerance table's own descriptions (docs/tolerances.md), the sheet's coverage table, install and programming errors. English by design.",
  notWords: 'Not words: CSS class names and a font.',
  provenance: "A figure's provenance as recorded: its document, edition, clause and what it measures, as data.",
  agentForm: "grid describe --for agent: a fixed format for agents, of tokens and ids. Its label is in the person's language.",
  notYet: 'Shown to the person, not moved yet: rooms text and its errors, the edit receipts, the measuring and quantity reports, the notes, export file texts, schema refusals and the other commands.',
} as const

/** Each file that still holds English sentences, with how many and why. */
const ALLOWED: Readonly<Record<string, readonly [number, keyof typeof WHY]>> = {
  'packages/cli/src/apps/cadApps.ts': [1, 'developer'],
  'packages/cli/src/brief/answer.ts': [2, 'notYet'],
  'packages/cli/src/brief/brief.ts': [58, 'agent'],
  'packages/cli/src/brief/layout.ts': [12, 'notYet'],
  // CNT-27: one more, a shaft counted once in a count of rooms.
  'packages/cli/src/brief/lines.ts': [30, 'notYet'],
  'packages/cli/src/command/check.ts': [10, 'command'],
  'packages/cli/src/command/describe.ts': [10, 'command'],
  // CMD-32: one fewer, --floor no longer needs --picture.
  'packages/cli/src/command/diff.ts': [13, 'command'],
  // SHT-10: one more, the refusal of --look dark for a file.
  'packages/cli/src/command/draw.ts': [46, 'command'],
  'packages/cli/src/command/drawShow.ts': [4, 'command'],
  'packages/cli/src/command/edit.ts': [9, 'command'],
  'packages/cli/src/command/export.ts': [20, 'command'],
  'packages/cli/src/command/init.ts': [18, 'command'],
  'packages/cli/src/command/language.ts': [2, 'command'],
  // CMD-43: three more, the --from refusals.
  'packages/cli/src/command/main.ts': [62, 'command'],
  'packages/cli/src/command/options.ts': [9, 'command'],
  'packages/cli/src/command/plan.ts': [27, 'command'],
  // CMD-30: one more, the refusal of an invisible character.
  'packages/cli/src/command/planText.ts': [20, 'command'],
  'packages/cli/src/command/scan.ts': [22, 'command'],
  'packages/cli/src/command/section.ts': [6, 'command'],
  // SHT-6: four more, the help of --scale, --paper, --floor and --room-sizes.
  'packages/cli/src/command/sheet.ts': [9, 'command'],
  'packages/cli/src/command/tidy.ts': [12, 'command'],
  // WRT-57: one less, the count of problems now said from the messages.
  // CMD-30: one more, the refusal of a read-only plan.
  // LVL-21: two more, the file's stairs kept when the text writes none.
  // CMD-43: three more, the help of --from, --layers and --units.
  // WRT-75: one fewer, the refusal over a fit-out is in the message files now.
  // CNT-45: three more, the items the text's lines place and the kept ones that moved with their walls.
  // CNT-46: four more, the file's bays and ramps kept when the text writes none.
  'packages/cli/src/command/write.ts': [46, 'command'],
  // ARE-18: one more, the agent's line for a way in across open sides.
  'packages/cli/src/describe/card.ts': [15, 'agentForm'],
  'packages/cli/src/describe/facts.ts': [2, 'notYet'],
  'packages/cli/src/describe/walk.ts': [4, 'agentForm'],
  // CMD-7: three of its skill's paragraphs are in guide/paragraphs.ts now.
  // CMD-40: seven more, the package README's, which lists the resources and the pages.
  'packages/cli/src/distribution/listing.ts': [88, 'developer'],
  'packages/cli/src/distribution/zip.ts': [1, 'developer'],
  // VEW-26: three more, the refusals of fit with distance and of fit=room with no room, and a room's outline.
  'packages/cli/src/draw/cameraAsk.ts': [15, 'agent'],
  'packages/cli/src/draw/canvas.ts': [1, 'developer'],
  'packages/cli/src/draw/drawPlan.ts': [2, 'developer'],
  'packages/cli/src/draw/drawStill.ts': [2, 'developer'],
  'packages/cli/src/draw/stamp.ts': [1, 'notWords'],
  // VEW-62: the refusals of grid_view's out.
  'packages/cli/src/draw/pictureFiles.ts': [2, 'agent'],
  // CMD-43: a DXF or IFC drawing read into rooms text, its refusals, notes and answer, as the scan's are.
  'packages/cli/src/drawing/dxf.ts': [25, 'notYet'],
  'packages/cli/src/drawing/fromDrawing.ts': [20, 'notYet'],
  'packages/cli/src/drawing/ifc.ts': [11, 'notYet'],
  'packages/cli/src/drawing/step.ts': [11, 'notYet'],
  'packages/cli/src/drawing/toRooms.ts': [9, 'notYet'],
  'packages/cli/src/edit/addOpening.ts': [26, 'notYet'],
  // WRT-73: the receipts and refusals of marking phases.
  'packages/cli/src/edit/phaseMarks.ts': [18, 'notYet'],
  'packages/cli/src/edit/addRoom.ts': [18, 'notYet'],
  // WRT-18: the refusal of a side move that does not fit, and the move that does.
  // CNT-44: the fill's receipts and refusals.
  'packages/cli/src/edit/fill.ts': [28, 'notYet'],
  'packages/cli/src/edit/fit.ts': [4, 'notYet'],
  // CNT-43: +1, the item at the size given.
  'packages/cli/src/edit/place.ts': [12, 'notYet'],
  // WRT-38: seven more, the receipt and refusals of one wall's thickness.
  // WRT-59: one more, a plan with nothing to mirror or turn.
  // WRT-73: one more, a mirror's line when it keeps the north.
  'packages/cli/src/edit/edits.ts': [66, 'notYet'],
  // WRT-59: the notes an edit caused, opening its answer.
  'packages/cli/src/edit/caused.ts': [1, 'notYet'],
  'packages/cli/src/edit/merge.ts': [32, 'notYet'],
  'packages/cli/src/edit/types.ts': [18, 'notYet'],
  'packages/cli/src/edit/phases.ts': [8, 'notYet'],
  'packages/cli/src/edit/rename.ts': [9, 'notYet'],
  'packages/cli/src/edit/seat.ts': [5, 'notYet'],
  // CNT-41: the plot's and the site's things' receipts and refusals.
  'packages/cli/src/edit/site.ts': [35, 'notYet'],
  // VEW-67: the trace image's receipts and refusals.
  'packages/cli/src/edit/trace.ts': [21, 'notYet'],
  // CNT-46: the bays' and the ramp's receipts and refusals.
  'packages/cli/src/edit/parking.ts': [10, 'notYet'],
  'packages/cli/src/edit/split.ts': [19, 'notYet'],
  // LVL-21: a stair's receipts and refusals.
  'packages/cli/src/edit/stairs.ts': [15, 'notYet'],
  // CNT-45: the items' receipts and refusals. CNT-47: two more, a row's receipt and its taken id.
  'packages/cli/src/edit/items.ts': [22, 'notYet'],
  'packages/cli/src/edit/square.ts': [11, 'notYet'],
  'packages/cli/src/edit/stretch.ts': [10, 'notYet'],
  'packages/cli/src/export/dxfProfile.ts': [5, 'command'],
  'packages/cli/src/export/projectExports.ts': [2, 'command'],
  'packages/cli/src/firm/standards.ts': [18, 'command'],
  // CMD-30: one more, the refusal of a read-only file.
  // CMD-41: one more, a lock that is a folder.
  'packages/cli/src/fs/projectFiles.ts': [51, 'command'],
  'packages/cli/src/library/answer.ts': [9, 'notYet'],
  'packages/cli/src/library/office.ts': [6, 'notYet'],
  'packages/cli/src/fs/textEncoding.ts': [5, 'command'],
  // CMD-7: the guide for agents, its shared paragraphs and its two resources, written for the agent.
  // MSG-22: eighteen fewer, none moved: the uses table no longer nests a template in a template, which the count read as more.
  // CMD-40: the one-line descriptions of the documentation pages, as the tool server lists them.
  'packages/cli/src/guide/docPages.ts': [21, 'agent'],
  // CNT-46: ten more, the car park's question.
  'packages/cli/src/guide/guide.ts': [90, 'agent'],
  'packages/cli/src/guide/paragraphs.ts': [16, 'agent'],
  'packages/cli/src/guide/resources.ts': [3, 'agent'],
  'packages/cli/src/mcp/projectTool.ts': [6, 'tools'],
  'packages/cli/src/mcp/briefTool.ts': [50, 'tools'],
  'packages/cli/src/mcp/diffTools.ts': [20, 'tools'],
  // ARE-60: two more, grid_rename_room's conditioned.
  // CNT-43: +7, grid_place_item's own figures and the width-and-depth refusal.
  // CNT-44: 23 more, grid_fill_room's help.
  'packages/cli/src/mcp/editTools.ts': [137, 'tools'],
  // WRT-74: grid_set_facts, its help and its argument checks.
  'packages/cli/src/mcp/factsTool.ts': [13, 'tools'],
  // WRT-75: grid_start_fit_out, its help, its arguments and its refusals.
  'packages/cli/src/mcp/fitOutTool.ts': [13, 'tools'],
  // CMD-42: grid_set, its help and its argument checks.
  'packages/cli/src/mcp/setTool.ts': [13, 'tools'],
  // ARE-14: grid_areas' outdoor_rules argument, its schema and its checks.
  'packages/cli/src/mcp/outdoorRulesArg.ts': [12, 'tools'],
  'packages/cli/src/mcp/previewTools.ts': [39, 'tools'],
  // CMD-7: its instructions' paragraphs are in guide/paragraphs.ts now.
  'packages/cli/src/mcp/protocol.ts': [14, 'agent'],
  // ARE-14: one more, grid_areas' description of the party walls, free floor and outdoor_rules.
  // CNT-19: one more, grid_takeoff's description of the parking bays and the ramps.
  // CNT-20: two more, the place tool and the library in the tools' descriptions.
  // ARE-18: two more, why a route's walked length is not given.
  // VEW-19: two more, grid_view's roof argument and its answer naming the stated roof.
  // WRT-43: three more, grid_view's refusal of a room in no view, saying why it was left out.
  // ARE-53: one more, the line of a measure that runs through a wall.
  // VEW-62: five more, grid_view's out argument, its description and its refusals.
  // ARE-60: one more, grid_areas' area under air.
  // WRT-74: one more, grid_fields' line on how facts are set.
  // CNT-45: five more, the kinds fixture and furniture, the items grid_view draws and of=fixtures.
  'packages/cli/src/mcp/readTools.ts': [388, 'tools'],
  // CNT-27: thirteen more, grid_count's rooms left out and its stairs argument, the schedule's rows in no total.
  // VEW-26: fourteen more, grid_view's fit and tile arguments, its answers saying what the picture was framed
  // to and that a long floor is drawn in pieces, and the refusals of a piece the floor does not have.
  // ARE-27: one more, grid_check's word on the brief's missed figures.
  // ARE-21: one more, the nearest way out and the others.
  'packages/cli/src/mcp/reportTool.ts': [30, 'tools'],
  'packages/cli/src/mcp/retelling.ts': [3, 'agent'],
  // CMD-41: based_on's description and planRevision's.
  'packages/cli/src/mcp/revisions.ts': [2, 'tools'],
  'packages/cli/src/mcp/sectionAnswer.ts': [5, 'tools'],
  'packages/cli/src/mcp/seenTool.ts': [16, 'tools'],
  // CMD-38: two more, the rooms grammar resource's title and description.
  'packages/cli/src/mcp/serveTools.ts': [3, 'tools'],
  // CMD-38: the whole rooms grammar, by topic, for the agent.
  // WRT-74: one more, the example of a room line with its number and facts.
  // CNT-41: four more, the site's lines.
  // LVL-21: three more, the stairs' topic.
  // WRT-75: three more, the fit-out's topic; LVL-22: six more, the turned floors topic.
  // CNT-45: seven more, the items' topic.
  // CNT-46: eight more, the parking topic. CNT-47: three more, the rows topic and the item kinds.
  'packages/cli/src/mcp/roomsGrammar.ts': [86, 'tools'],
  // CNT-46: grid_place_bays and grid_add_ramp, their descriptions, arguments and refusals.
  'packages/cli/src/mcp/parkingTools.ts': [46, 'tools'],
  // CNT-41: grid_set_site and grid_change_site, their descriptions, arguments and refusals.
  'packages/cli/src/mcp/siteTools.ts': [45, 'tools'],
  // LVL-21: grid_add_stair and grid_change_stair, their descriptions, arguments and refusals.
  'packages/cli/src/mcp/stairTools.ts': [28, 'tools'],
  // CNT-45: the item tools' help and refusals. CNT-47: twelve more, the row and side-clearance arguments.
  'packages/cli/src/mcp/itemTools.ts': [51, 'tools'],
  // VEW-67: the trace image's tool.
  'packages/cli/src/mcp/traceTool.ts': [26, 'tools'],
  // WRT-36: grid tidy on the tool server, its description, arguments, answer and refusals.
  'packages/cli/src/mcp/tidyTool.ts': [15, 'tools'],
  // MSG-24: grid_words, its description, arguments, answers, refusals and the hint other answers add.
  'packages/cli/src/mcp/wordsTool.ts': [31, 'tools'],
  'packages/cli/src/mcp/toolkit.ts': [28, 'agent'],
  // CMD-39: the whole and page arguments every tool takes, and left_out in the output schemas.
  'packages/cli/src/mcp/budget.ts': [3, 'agent'],
  // WRT-73: the three phase tools, their arguments and refusals.
  'packages/cli/src/mcp/phaseTools.ts': [26, 'tools'],
  'packages/cli/src/mcp/viewTool.ts': [15, 'tools'],
  // SHT-6: eight more, grid_sheet's layout drawing, its arguments and its refusals.
  // WRT-38: six more, grid_change_wall's description and arguments.
  // CMD-38: three more, roomsFile's description and refusal, and what rooms text writes.
  // SHT-20: two more.
  // VEW-62: one more, grid_sheet's pictures of the pages.
  // WRT-73: six more, the phase rules, the correction argument and its note, and keep_north.
  // VEW-64: one more, the floors an export holds.
  // CMD-43: six more, the from, layers and units arguments and their refusals.
  'packages/cli/src/mcp/writeTools.ts': [158, 'tools'],
  'packages/cli/src/occupancy/occupancy.ts': [16, 'notYet'],
  'packages/cli/src/preview/localServer.ts': [6, 'agent'],
  'packages/cli/src/preview/record.ts': [4, 'command'],
  'packages/cli/src/quantities/access.ts': [49, 'notYet'],
  'packages/cli/src/quantities/areas.ts': [9, 'notYet'],
  'packages/cli/src/quantities/change.ts': [18, 'notYet'],
  'packages/cli/src/quantities/compare.ts': [25, 'notYet'],
  // CNT-31: three more, the roof edges' rule and line and why a roof is left out.
  'packages/cli/src/quantities/estimate.ts': [41, 'notYet'],
  'packages/cli/src/quantities/finishes.ts': [2, 'notYet'],
  'packages/cli/src/quantities/facing.ts': [25, 'notYet'],
  // ARE-14: the free floor rule is one of the area measures now, in the message files.
  'packages/cli/src/quantities/fixtures.ts': [1, 'notYet'],
  'packages/cli/src/quantities/limits.ts': [29, 'notYet'],
  'packages/cli/src/quantities/measure.ts': [3, 'notYet'],
  // ARE-61: four more, the room type, tenure, flat and flat type fields' descriptions for the agent.
  // CNT-45: seven more, the items' kinds and fields.
  'packages/cli/src/quantities/query.ts': [37, 'tools'],
  'packages/cli/src/quantities/rates.ts': [36, 'notYet'],
  // CNT-27: one more, the CSV's column for the rows in no total.
  'packages/cli/src/quantities/schedule.ts': [16, 'notYet'],
  // CNT-41: two more, what the coverage counts.
  'packages/cli/src/quantities/site.ts': [23, 'notYet'],
  'packages/cli/src/quantities/state.ts': [3, 'notYet'],
  'packages/cli/src/quantities/sun.ts': [13, 'notYet'],
  'packages/cli/src/quantities/takeoff.ts': [10, 'notYet'],
  'packages/cli/src/quantities/use.ts': [32, 'notYet'],
  'packages/cli/src/quantities/walked.ts': [3, 'notYet'],
  'packages/cli/src/report/draft.ts': [16, 'notYet'],
  // MSG-19: three more, the refusals of a seen file with a mark Grid could not read.
  'packages/cli/src/seen/marks.ts': [24, 'notYet'],
  // CNT-16: +1, the columns' place on the sheet ("drawn and tabled").
  'packages/cli/src/sheet/coverage.ts': [30, 'developer'],
  // SHT-6: the refusal of a floor too large for the paper.
  'packages/cli/src/sheet/drawingSheet.ts': [3, 'command'],
  'packages/cli/src/sheet/fonts.ts': [1, 'developer'],
  // SHT-6: nine more, the drawing's refusals, its answer line and its file note.
  'packages/cli/src/sheet/sheetFile.ts': [15, 'command'],
  // WRT-12: one more, the heading of the openings that moved with their wall or room.
  // CMD-32: one more, what a floor's change heading left out.
  'packages/cli/src/versions/diff.ts': [12, 'notYet'],
  'packages/cli/src/versions/git.ts': [19, 'notYet'],
  'packages/cli/src/versions/markers.ts': [19, 'notYet'],
  'packages/floorplan/src/geometry/areas.ts': [36, 'notYet'],
  'packages/floorplan/src/geometry/camera.ts': [1, 'agent'],
  'packages/floorplan/src/geometry/diff/building.ts': [28, 'notYet'],
  'packages/floorplan/src/geometry/diff/churn.ts': [2, 'notYet'],
  'packages/floorplan/src/geometry/diff/scope.ts': [1, 'notYet'],
  'packages/floorplan/src/geometry/diff/summary.ts': [4, 'notYet'],
  'packages/floorplan/src/geometry/diff/turn.ts': [7, 'notYet'],
  'packages/floorplan/src/geometry/diff/validity.ts': [1, 'notYet'],
  'packages/floorplan/src/geometry/envelope.ts': [4, 'notYet'],
  'packages/floorplan/src/geometry/handing.ts': [6, 'notYet'],
  'packages/floorplan/src/geometry/export/dxfProfile.ts': [8, 'command'],
  'packages/floorplan/src/geometry/export/ifc.ts': [38, 'notYet'],
  'packages/floorplan/src/geometry/export/leftOut.ts': [2, 'notYet'],
  'packages/floorplan/src/geometry/export/obj.ts': [2, 'notYet'],
  'packages/floorplan/src/geometry/outline.ts': [1, 'notYet'],
  'packages/floorplan/src/geometry/rounding.ts': [1, 'developer'],
  'packages/floorplan/src/geometry/rules/doors.ts': [2, 'notYet'],
  'packages/floorplan/src/geometry/shell.ts': [2, 'notYet'],
  // CNT-16: +5, what the three column and grid entries decide.
  // SHT-10: five more pieces of the table's own descriptions (sillProjection, and the frame and glass entries).
  // CNT-19: four more, what bayOverlap and rampSlopeDiffers decide.
  // CNT-20: two more, its own tolerance entries.
  // HND-10: one more, the trace image's unscaled drawing scale (traceUnscaled).
  // ARE-25: six more, what corridorRasterAcross and corridorEndTurn decide.
  // CNT-36: seven more, what roomsFaceSkew and writtenParallel decide.
  'packages/floorplan/src/geometry/tolerances.ts': [342, 'developer'],
  'packages/floorplan/src/geometry/itemKinds.ts': [2, 'developer'],
  'packages/floorplan/src/library/builtIn.ts': [1, 'provenance'],
  // CNT-43: +2, a kind placed with no size and a typical room given figures.
  'packages/floorplan/src/library/index.ts': [6, 'notYet'],
  'packages/floorplan/src/geometry/use.ts': [9, 'notYet'],
  'packages/floorplan/src/geometry/vec2.ts': [2, 'developer'],
  'packages/floorplan/src/geometry/wall.ts': [2, 'developer'],
  'packages/floorplan/src/geometry/wallFaults.ts': [3, 'notYet'],
  'packages/floorplan/src/notes/notes.ts': [18, 'notYet'],
  'packages/floorplan/src/rooms/answer.ts': [6, 'notYet'],
  // WRT-14: four fewer, the floor line's refusals moved into the message files.
  // LVL-16: one fewer, the warning of ids changed on several floors moved into the message files.
  // WRT-51: two fewer, the sides facing one way moved into the message files.
  // WRT-55: nine fewer, the gap, touching, overlap and wall-line refusals moved too.
  // WRT-66: one fewer, the corner cut's refusal that does not fit moved too.
  // WRT-69: one fewer, the walls line's word it cannot read moved into the message files.
  'packages/floorplan/src/rooms/compile.ts': [102, 'notYet'],
  'packages/floorplan/src/rooms/layout.ts': [4, 'notYet'],
  // WRT-42: one fewer, the raw floor's comment line, now in the messages.
  'packages/floorplan/src/rooms/read.ts': [22, 'notYet'],
  // CNT-46: the bay, bays and ramp lines' refusals, what they chose and their summaries.
  'packages/floorplan/src/rooms/parking.ts': [95, 'notYet'],
  // CNT-41: the site lines' refusals and notes, and north in words.
  'packages/floorplan/src/rooms/site.ts': [30, 'notYet'],
  // LVL-21: the stair lines' refusals, the stair's summary and the read-back's note.
  'packages/floorplan/src/rooms/stairs.ts': [39, 'notYet'],
  // CNT-45: the item lines' refusals and guesses. CNT-47: five more, the clear floor at a side.
  'packages/floorplan/src/rooms/items.ts': [50, 'notYet'],
  // CNT-47: the row lines' refusals.
  'packages/floorplan/src/rooms/rows.ts': [18, 'notYet'],
  'packages/floorplan/src/rooms/words.ts': [4, 'notYet'],
  'packages/floorplan/src/scan/evidence.ts': [2, 'notYet'],
  'packages/floorplan/src/scan/roomModel.ts': [22, 'notYet'],
  'packages/floorplan/src/scan/toPlan.ts': [30, 'notYet'],
  // LVL-20: one more, the most dormers one roof lists, as the rooflights' is worded.
  'packages/floorplan/src/types/floorplan.ts': [61, 'notYet'],
  'packages/floorplan/src/types/places.ts': [7, 'notYet'],
  // CMD-7: the plan JSON Schema's title, its description, and the error for a schema part it cannot write.
  'packages/floorplan/src/types/planSchema.ts': [3, 'developer'],
  // CMD-30: one more, the refusal of an invisible character.
  'packages/floorplan/src/types/planText.ts': [6, 'notYet'],
  'packages/floorplan/src/types/sheet.ts': [16, 'notYet'],
  'packages/floorplan/src/types/units.ts': [7, 'notYet'],
  'packages/rules/src/checks/figures.ts': [7, 'provenance'],
  'packages/rules/src/checks/place.ts': [1, 'command'],
  'packages/rules/src/lookup/prompt.ts': [18, 'agent'],
  'packages/rules/src/notes/notes.ts': [6, 'notYet'],
  'packages/rules/src/result/plurals.ts': [6, 'developer'],
  'packages/rules/src/sheet/rulesSheet.ts': [9, 'notYet'],
  // CMD-30: the atomic writer's refusal of a read-only file.
  'packages/rules/src/store/atomicWrite.ts': [1, 'notYet'],
  'packages/rules/src/store/store.ts': [1, 'developer'],
  'packages/viewer/src/canvas2d/Canvas2D.tsx': [1, 'notWords'],
  'packages/viewer/src/page/previewPage.ts': [5, 'notYet'],
  'packages/viewer/src/picture/facade.ts': [2, 'developer'],
  // HND-10: one more, the refusal of a trace image given as anything but a data: address.
  'packages/viewer/src/picture/planSvg.ts': [4, 'developer'],
  'packages/viewer/src/picture/section.ts': [1, 'developer'],
  'packages/viewer/src/still/index.ts': [2, 'developer'],
}

function sources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name === '__tests__' || name === 'test-support' || name === 'node_modules' || name === 'messages') continue
      out.push(...sources(path))
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

const LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g
/** Three or more words in a row, the first maybe capitalised: an English sentence or a piece of one. */
const SENTENCE = /(?:^|[^A-Za-z0-9_./-])[A-Za-z][a-z']*(?: [a-z][a-z']*){2,}/

/** How many literals in a file's code look like an English sentence. Comments are left out. */
function englishSentences(text: string): number {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  let count = 0
  for (const match of code.matchAll(LITERAL)) {
    const literal = (match[1] ?? match[2] ?? match[3] ?? '').replace(/\$\{[^}]*\}/g, ' X ')
    if (SENTENCE.test(literal)) count++
  }
  return count
}

describe("Grid's own sentences come from the message files (MSG-11)", () => {
  const files = PACKAGES.flatMap((name) => sources(join(ROOT, 'packages', name, 'src')))
  const counts = new Map(files.map((file) => [relative(ROOT, file).split('\\').join('/'), englishSentences(readFileSync(file, 'utf8'))] as const))

  it('reads the sources', () => {
    expect(files.length).toBeGreaterThan(200)
    expect(counts.has('packages/rules/src/result/catalogue.ts')).toBe(true)
  })

  it('finds an English sentence where one is written, and not in a key or a placeholder', () => {
    expect(englishSentences("const a = 'This plan has a door'")).toBe(1)
    expect(englishSentences('const a = `${room} has no door`')).toBe(1)
    expect(englishSentences("say('es', 'line.plan/not-json.says', { place: 'walls[2].thickness' })")).toBe(0)
    expect(englishSentences('// a comment that says a lot of words')).toBe(0)
  })

  it('holds no English sentence outside the message files but those listed, each by its exact count', () => {
    const wrong: string[] = []
    for (const [file, count] of counts) {
      const allowed = ALLOWED[file]?.[0] ?? 0
      if (count > allowed) wrong.push(`${file}: ${count} English sentences, ${allowed} allowed. Move the new ones into the message files (docs/languages.md).`)
      if (count < allowed) wrong.push(`${file}: ${count} English sentences, listed with ${allowed}. Lower its count here: it moved some.`)
    }
    for (const file of Object.keys(ALLOWED)) if (!counts.has(file)) wrong.push(`${file} is listed but is not a source file any more: take it off the list.`)
    expect(wrong).toEqual([])
  })

  it('says why each listed file still holds English, and how much of it is left to move', () => {
    const left = Object.values(ALLOWED).reduce((n, [count, why]) => (why === 'notYet' || why === 'command' ? n + count : n), 0)
    for (const [file, [count, why]] of Object.entries(ALLOWED)) {
      expect(WHY[why].length, file).toBeGreaterThan(0)
      expect(count, file).toBeGreaterThan(0)
    }
    // The ratchet: what is shown to the person and not moved yet only comes down. It was 913 when
    // MSG-11 landed; main's MSG-5, COD-3, CNT-8, CNT-9, BRF-1, BRF-5, LVL-6, WRT-8 and VEW-3 brought
    // 190 more of the kinds MSG-11 left for later, LVL-8 8, HND-1 14, BRF-3 and WRT-4 63, LVL-9
    // and CNT-17 65, COD-8 18, HND-11 3, the refusals of a taped length in the plan's schema, and
    // CNT-10, VEW-9, VEW-4 and WRT-7 55: the commands' new options, usage and refusals (describe 3,
    // main 6, plan 5, tidy 1, write 2, the preview record's 4), the change takeoff (18), the edits'
    // phase receipts (4), the areas' note after the work (2), the walked rule (1), diff by phase
    // (3), a rooms text size refusal (1) and the preview page (5); and HND-12 and BRF-4 113: the
    // phone scan's refusals and notes (floorplan scan/ 54, command/scan.ts 22), the site limits'
    // measures (29), the area rules for an outline (4), the outline's schema refusal (1) and the
    // commands' new options (main 2, write 1); and CNT-4 10: the flats in rooms text (1), the
    // schema (1), the area rules (1, and the CLI's 1), the flat schedule's rules (3) and the
    // commands' refusals (planText 1, write 2); and LVL-5 1: a moved stair's note (notes.ts); and
    // BRF-6 21: the first layout's refusals and answer (rooms/layout.ts 4, brief/layout.ts 12), the
    // alignment offered for a door in rooms text (1) and the commands' new option (main 3, write 1)
    // (reviews/MSG-11.md, "After merging main"); and CNT-14 33: a door's handing refused in rooms
    // (handing.ts 6), kinds and handing in rooms text (compile.ts 7, read.ts 2), the opening edits'
    // receipts (edits.ts 7), the IFC's kinds (5), the diff's change lines (building.ts 3, compare.ts
    // 1) and the opening schedule's new CSV columns (2) (reviews/CNT-14.md); and ARE-15 3: the
    // door and window types' rule and their CSV's two opens columns (schedule.ts) (reviews/ARE-15.md);
    // and CNT-6 1: a context shape's outline refusal in the schema (reviews/CNT-6.md);
    // and CNT-15 29: the type change's receipts and refusals (edit/types.ts 14), a knock-through's
    // finish refusal and receipts (merge.ts 2), the estimate's type and finish rules and lines
    // (estimate.ts 6), the finish and wall type rules (finishes.ts 2), the IFC's two type notes
    // (ifc.ts 2) and the schema's three blank-name refusals (floorplan.ts 3) (reviews/CNT-15.md);
    // and SHT-10 1: grid draw's refusal of --look dark for a file (draw.ts) (reviews/SHT-10.md);
    // and SHT-6 13: grid sheet's drawing options, refusals and answer (command/sheet.ts,
    // sheet/sheetFile.ts, sheet/drawingSheet.ts and main.ts together) (reviews/SHT-6.md);
    // and CNT-20 32: the place tool's receipts (edit/place.ts 11), the library's answer and its
    // rule (library/answer.ts 9), the office folder's problems (library/office.ts 6), the
    // library's refusals (library/index.ts 4), the schema's library mark (floorplan.ts 1) and
    // describe's furniture heading (1) (reviews/CNT-20.md).
    // and WRT-11 5: the verdict's room and opening counts (compare.ts).
    // and WRT-16 3: write's refusals of rooms text with no rooms and of floors it would drop,
    // and its line on the floors dropped (command/write.ts) (odd/tasks/WRT-16.md).
    // and WRT-15 4: the room edits' receipts in a plan with phases (edit/phases.ts).
    // describe's furniture heading (1) (reviews/CNT-20.md); and WRT-12 1: grid diff's heading for
    // the openings that moved with their wall or room (versions/diff.ts).
    // and MSG-19 3: the seen file's refusals (seen/marks.ts).
    // and WRT-28 3: the flats lines of a merge (edit/merge.ts) (odd/tasks/WRT-28.md).
    // and WRT-33 3: the merge's stale type and doubled door lines (edit/merge.ts, mcp/editTools.ts).
    // and WRT-50 1: the merge refuses rooms that meet in more than one outline (edit/merge.ts).
    // and CNT-27 2: a shaft counted once in the brief, the schedule CSV's column for rows in no total.
    // and CNT-31 3: the estimate's roof edges' rule and line, and why a roof is left out (estimate.ts).
    // and WRT-72 22: the add-opening change's receipts and refusals (edit/addOpening.ts) and its tool's help (mcp/editTools.ts).
    // and WRT-38 4: one wall's thickness, its receipt and refusals (edit/edits.ts).
    // and CNT-34 4: the estimate's gable lines and their rules (estimate.ts).
    // and ARE-44 3: the step line's floor-level and ground-step lines (brief/lines.ts).
    // and ARE-48 5: the keep-apart line's ways between the rooms (brief/lines.ts).
    // and ARE-56 1: the line's note that a room of the wish's use was taken for the name (brief/lines.ts).
    // and 3 more from the same merge (CMD-25, CNT-37 and CMD-26 each raised the cap on their own).
    // and CMD-35 2: diff's --out refusal and help line, and the drawing refusal's reason (the sheet
    // refusal for no layout is gone).
    // and SHT-20 2: printing a sheet at a stated scale and paper size (it used the cap's slack on its own).
    // and CNT-40 1: the estimate's plural words for the new room uses (quantities/estimate.ts).
    // and CMD-41 1: the refusal of a plan lock that is a folder (fs/projectFiles.ts).
    // and WRT-73 51: setting phases, its receipts and refusals (edit/phaseMarks.ts 18), its tools
    // (mcp/phaseTools.ts 26), the correction and keep_north words (mcp/writeTools.ts 6, edit/edits.ts 1).
    // and LVL-20 1: the most dormers one roof lists (types/floorplan.ts).
    // and CNT-41 116: the site lines in rooms text (rooms/site.ts 30), the site's changes
    // (edit/site.ts 35), their tools (mcp/siteTools.ts 45), the grammar's site topic (4) and what
    // the coverage counts (quantities/site.ts 2) (odd/tasks/CNT-41.md).
    // and LVL-21 87: the stair lines in rooms text (rooms/stairs.ts 39), the stairs' changes
    // (edit/stairs.ts 15), their tools (mcp/stairTools.ts 28), the grammar's stairs topic (3) and
    // the file's stairs kept by grid write (command/write.ts 2) (odd/tasks/LVL-21.md).
    // and CNT-43 10: an item placed at its own size or by its kind, its receipt, refusals and its
    // tool's help (edit/place.ts 1, library/index.ts 2, mcp/editTools.ts 7).
    // and CNT-44 28: the fill's receipts and refusals (edit/fill.ts).
    // and VEW-67 47: the trace image's change (edit/trace.ts 21) and its tool (mcp/traceTool.ts 26).
    // and CMD-43 82: a drawing read into rooms text (drawing/ 76) and write's --from (main 3, write 3).
    // and CNT-45 68: the item lines in rooms text (rooms/items.ts 45), the items' changes
    // (edit/items.ts 20) and grid write's items placed and moved (command/write.ts 3) (odd/tasks/CNT-45.md).
    // and CNT-46 173: the bay, bays and ramp lines in rooms text (rooms/parking.ts 95), the parking
    // changes (edit/parking.ts 10), their tools (mcp/parkingTools.ts 46), the grammar's parking topic
    // (8), the guide's car park (10) and the file's bays and ramps kept by grid write
    // (command/write.ts 4) (odd/tasks/CNT-46.md).
    // and CNT-47 25: the row lines in rooms text (rooms/rows.ts 18), the clear floor at an item's
    // sides (rooms/items.ts 5) and a row's receipt and taken id (edit/items.ts 2) (odd/tasks/CNT-47.md).
    expect(left).toBeLessThanOrEqual(2351)
  })

  it('keeps the moved parts at none: the result record, the checks, the report, the drawings and the sheet', () => {
    for (const file of [
      'packages/rules/src/result/catalogue.ts',
      'packages/rules/src/result/inspect.ts',
      'packages/rules/src/checks/messages.ts',
      'packages/rules/src/checks/figureWords.ts',
      'packages/rules/src/checks/coverage.ts',
      'packages/floorplan/src/geometry/validate.ts',
      'packages/floorplan/src/geometry/rules/messages.ts',
      'packages/floorplan/src/types/readParts.ts',
      'packages/viewer/src/picture/scene.ts',
      'packages/cli/src/sheet/pages.ts',
      // After merging main at e486ccba: LVL-9's section, its list of what it took and the plan's marks.
      'packages/floorplan/src/geometry/section.ts',
      'packages/viewer/src/picture/drawingMarks.ts',
      'packages/cli/src/draw/drawSection.ts',
      // After merging main at 4fe29edc: COD-8's firm standards, their lines and where each was measured.
      'packages/rules/src/result/firm.ts',
      'packages/cli/src/firm/measure.ts',
      // After merging main at 90a933b1: HND-11's taped lengths, their table and a GLB's origin note.
      'packages/floorplan/src/geometry/taped.ts',
      'packages/cli/src/taped/table.ts',
      'packages/floorplan/src/geometry/export/gltf.ts',
      // After merging main at fbe5160e: CNT-10's phases, a part that stands when its wall does not.
      'packages/floorplan/src/geometry/phases.ts',
      // After merging main at ed8b9f75: CNT-4's flats list and its faults.
      'packages/floorplan/src/geometry/flats.ts',
      // After merging main at cf8b8084: LVL-5's walls through floors and floors that line up.
      'packages/floorplan/src/geometry/through.ts',
      'packages/floorplan/src/geometry/stacking.ts'
    ]) {
      expect(counts.get(file), file).toBe(0)
    }
  })
})
