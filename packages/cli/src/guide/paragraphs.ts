/**
 * CMD-7 (lab WR-11, F5, F7): the paragraphs Grid tells an agent in more than one place, written
 * once. The tool server's instructions (`INSTRUCTIONS`), the plugin's skill
 * (`distribution/listing.ts`), the guide for agents (`guide.ts`, `docs/agent-guide.md`, the
 * resource `grid://guide`) and the README's quick-start are made from these, and
 * `guide/__tests__/oneSource.test.ts` fails when one of them no longer carries a paragraph as
 * written here. `SHARED` says which carries which.
 *
 * Plain text, no markdown: the instructions are one line of text. Pure: no file, no network.
 */
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import { RETELLING_RULE } from '../mcp/retelling'

/** What Grid's tools do, and the one argument every tool takes. */
export const TOOLS_WORK_ON_PLANS =
  'Grid draws floor plans for any small space (a van, a cabin, a module, a container) as well as whole buildings, and gives a picture and the free-floor numbers in one or two calls: grid_view draws, grid_areas measures, and grid_export and grid_sheet make files, a whole-building 3D model (GLB) among them. Grid\'s tools read, measure, check, draw and change floor plans kept in plan files inside the project folder. Pass plan: the plan file, as a path inside that folder.'

/** BRF-1: the brief comes first, from the person's words. */
export const BRIEF_FIRST =
  'Before the first room, keep what the person asked for with grid_write_brief, from their own words, each wish given or assumed; every change then says which lines are met and which missed.'

/**
 * WRT-7: the person's units come from their words or their place, asked only when neither says,
 * and are recorded in the plan's `display`, which every drawing, figure and sheet follows. The plan
 * file stays in metres.
 */
export const UNITS_RULE =
  'Work in the person\'s units: settle them with the brief, from their words (12 ft, 1,800 sq ft, 4 m) or their place, and ask only when neither says. '
  + 'Record them with a display line in the rooms text (display ft-in, display m): Grid\'s drawings, figures and sheets follow it, and the plan file stays in metres. A length may carry its unit in one word (360cm, 12ft, 12\'6").'

/** WRT-1, WRT-2: rooms first is the main way to write a plan. */
export const ROOMS_FIRST =
  'Write a plan rooms first, the main way to write one: name the rooms with their inside sizes and neighbours, and the doors and windows by the rooms they join, and grid_write_rooms works out the walls.'

/** WRT-2: the plan file, not the rooms text, is the source of truth. */
export const SOURCE_OF_TRUTH =
  'The plan file is the source of truth; rooms text is a way of writing and reading it. To change a plan, read it back with grid_describe as=rooms, change the text and write it with grid_write_rooms. Each room\'s boundary is derived: never edit it by hand.'

/**
 * CMD-7 (lab WR-11): what every test model asked before its first plan: what to draw for a stair,
 * which word to use for an office or a toilet, whether a size is inside or outside, whether a
 * dividing line has a thickness, and what to do with an L-shaped room.
 */
export const FIRST_QUESTIONS =
  'A room\'s size is to the inside faces of its walls, unless its line says centre or outside. '
  + 'A stair is a room used as stair on every floor it joins, in the same place (through <top floor> writes it once); a lift is a room used as lift. '
  + 'A room\'s use is one of Grid\'s words: an office is office, a toilet or a WC is toilet, and the room\'s name keeps the person\'s own word. '
  + 'Where one open space has parts, such as a kitchen open to a living room, the line between them is a dividing line with no thickness: open on the room line, or a virtual wall. '
  + 'An L-shaped room is one room, written with polygon and its inside corners.'

/** CMD-7: where the whole guide and the plan's structure are, for an agent of the tool server. */
export const GUIDE_AND_SCHEMA =
  'Before a first plan, read the guide for agents, the resource grid://guide: rooms first, the raw-wall form for what rooms text cannot say, and the answers to what agents ask. '
  + 'The plan file\'s structure is a JSON Schema, the resource grid://schema/plan.'

/**
 * What the guide, the server's instructions and the tools that write a plan, an export or a
 * sheet all say (HND-9). The DXF writes each room's name, the IFC its name and id, OBJ and GLB
 * its id, the sheet its name; the plan file holds both.
 */
export const ROOM_NAMES_TRAVEL =
  'Room names and ids go into every export (DXF, IFC, OBJ, GLB) and sheet, and travel with the plan file: never put a person\'s name in a room\'s name or id. '
  + 'Who sits where belongs in the occupancy file beside the plan (plan.occupancy.json), which no export carries.'

/** The label every report carries, and how a report is retold (MSG-3). */
export const LABEL_AND_RETELLING = `Every report carries the label ${GENERAL_GUIDANCE_LABEL}. ${RETELLING_RULE}`

/** Where a shared paragraph is carried. */
export type GuidePlace = 'instructions' | 'skill' | 'guide' | 'readme'

/** Each shared paragraph, by name, with the places that carry it as written here. */
export const SHARED: Readonly<Record<string, { readonly text: string; readonly in: readonly GuidePlace[] }>> = {
  TOOLS_WORK_ON_PLANS: { text: TOOLS_WORK_ON_PLANS, in: ['instructions', 'guide'] },
  BRIEF_FIRST: { text: BRIEF_FIRST, in: ['instructions', 'guide'] },
  UNITS_RULE: { text: UNITS_RULE, in: ['instructions', 'skill', 'guide'] },
  ROOMS_FIRST: { text: ROOMS_FIRST, in: ['instructions', 'skill', 'guide', 'readme'] },
  SOURCE_OF_TRUTH: { text: SOURCE_OF_TRUTH, in: ['instructions', 'skill', 'guide'] },
  FIRST_QUESTIONS: { text: FIRST_QUESTIONS, in: ['instructions', 'skill', 'guide', 'readme'] },
  GUIDE_AND_SCHEMA: { text: GUIDE_AND_SCHEMA, in: ['instructions', 'skill'] },
  ROOM_NAMES_TRAVEL: { text: ROOM_NAMES_TRAVEL, in: ['instructions', 'skill', 'guide'] },
  LABEL_AND_RETELLING: { text: LABEL_AND_RETELLING, in: ['instructions', 'skill', 'guide'] },
}
