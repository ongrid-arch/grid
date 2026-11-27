/**
 * The tools of `grid serve`, in the order `tools/list` gives them: the tools that read the
 * plan first, ordered by the requests they answer most often (lab entry Y-2), with the problem
 * report last of them (CMD-13), then the preview and the preview page's own call (VEW-4), the export, the sheet, the start marker
 * (WRT-8), the seen mark (MSG-10), the brief (BRF-1), Grid's words in the person's language (MSG-24),
 * undo and restore (CMD-44), and last the tools that change the plan, the site's two (CNT-41) and then the saved views last
 * of them (VEW-3).
 *
 * Every path an agent passes goes through the project's resolver (`fs/projectFiles.ts`):
 * inside the project folder or refused, with a message naming the path and the folder. The
 * project folder is fixed when the server starts.
 */
import { CanvasMissing } from '../draw/canvas'
import type { PathRefused, Project } from '../fs/projectFiles'
import { FontsMissing } from '../sheet/fonts'
import type { ServerResource, ServerTool, ToolAnswer } from './protocol'
import { PREVIEW_RESOURCE_MIME, PREVIEW_RESOURCE_URI } from '@ongrid/viewer/src/page/names'
import { READ_TOOLS } from './readTools'
import { reportProblemTool } from './reportTool'
import { markSeenTool } from './seenTool'
import { writeBriefTool } from './briefTool'
import { wordsHint, wordsTool, WORDS_TOOL_NAME } from './wordsTool'
import { DEFAULT_LANGUAGE, hasWording, listenForKeys, say, setPlanWords, type Language, type MessageKey } from '@ongrid/floorplan/messages'
import { askedAnswerLanguage, LANGUAGE_ARG_NAME, loadShipped, serverReadsLanguage, type Spoken } from './answerLanguage'
import { diffTool, markStartTool } from './diffTools'
import { shapedData } from './figures'
import { checkPage, PageRefused, PAGE_ARG_NAME, WHOLE_ARG_NAME, withinBudget } from './budget'
import { labelled, LABEL_SILENT_TOOLS, readArgs, ToolRefusal, type GridTool, type ToolContext } from './toolkit'
import { WRITE_TOOLS } from './writeTools'
import { guideResources } from '../guide/resources'
import { roomsGrammarMarkdown, ROOMS_GRAMMAR_URI } from './roomsGrammar'
import { EDIT_TOOLS } from './editTools'
import { PHASE_TOOLS } from './phaseTools'
import { FIT_OUT_TOOLS } from './fitOutTool'
import { projectTool } from './projectTool'
import { guardedRun, revisionLine, RevisionRefused, REVISION_DATA_NAME } from './revisions'
import { saveViewTool } from './viewTool'
import { previewSyncTool, previewTool } from './previewTools'
import { tidyTool } from './tidyTool'
import { setFactsTool } from './factsTool'
import { setFinishesTool } from './finishesTool'
import { setTool } from './setTool'
import { SITE_TOOLS } from './siteTools'
import { CONTEXT_TOOLS } from './contextTools'
import { setPlanTool } from './planTool'
import { STAIR_TOOLS } from './stairTools'
import { BUILDING_TOOLS } from './buildingTools'
import { setLevelsTool } from './levelsTool'
import { ITEM_TOOLS } from './itemTools'
import { PARKING_TOOLS } from './parkingTools'
import { placeTraceTool } from './traceTool'
import { annotateTool } from './annotateTool'
import { VERSION_TOOLS } from './versionTools'
import { helpTool } from './helpTool'
import { commonArgDescriptions, listedDefinition } from './toolList'
import { inGroups, type ToolGroup } from './toolGroups'

export { EXPORT_TOOL_NAME } from './writeTools'
export { PREVIEW_TOOL_NAME } from './previewTools'

/** Every tool, in its fixed order. */
export const GRID_TOOLS: readonly GridTool[] = [
  // CMD-18: what the folder holds, the first call of a session.
  projectTool,
  // CMD-52: what the short tool list leaves out, and the tool groups: listed by every server.
  helpTool,
  // WRT-8: what a change did, right after the comparison of separate plans it is told apart from.
  READ_TOOLS[0]!,
  diffTool,
  ...READ_TOOLS.slice(1),
  // CMD-13: the last of the reading tools, for the rarest request: telling Grid's makers.
  reportProblemTool,
  // VEW-4: the preview the person and the agent share, then the page's own call (visibility app).
  previewTool,
  previewSyncTool,
  ...WRITE_TOOLS.filter((tool) => tool.hint === 'write-file'),
  // WRT-8: writes the markers file beside the plan, never the plan.
  markStartTool,
  // MSG-10: writes the marks file beside the plan, never the plan: the last of the files it writes.
  markSeenTool,
  // BRF-1: writes the brief beside the plan, never the plan: written before the first room.
  writeBriefTool,
  // MSG-24: writes Grid's words in the person's language into the plan's display, never the building.
  wordsTool,
  // CMD-44: the plan put back as it was, the last change undone or an earlier version restored, before the changes that make one.
  ...VERSION_TOOLS,
  ...WRITE_TOOLS.filter((tool) => tool.hint === 'change-plan'),
  ...EDIT_TOOLS,
  // WRT-73: phases set without hand-editing: the plan as it stands as existing, parts by id or room, one plan from two.
  ...PHASE_TOOLS,
  // WRT-75: a fit-out started on a base plan, which stays read-only.
  ...FIT_OUT_TOOLS,
  // WRT-36: grid tidy's fixes where walls meet, the last of the changes to the building.
  tidyTool,
  // CMD-42: any other field of a part set by id, checked by the plan schema.
  setTool,
  // WRT-74: facts of the person's own and a room's number, which change no part of the building.
  setFactsTool,
  // CNT-51: the finishes of many rooms, per wall face and in height bands.
  setFinishesTool,
  // LVL-21: a stair between two floors, added, changed or removed: the last of the building's changes.
  ...STAIR_TOOLS,
  // LVL-23: which floors are each building's, and the ground each stands on.
  ...BUILDING_TOOLS,
  // LVL-24: the floors' floor-to-floor, stacked as their levels.
  setLevelsTool,
  // CNT-45: fixtures and furniture added against a wall, moved and taken out.
  ...ITEM_TOOLS,
  // CNT-46: rows of parking bays placed and a ramp added between two floors, after the stairs.
  ...PARKING_TOOLS,
  // CNT-41: the plot, north and the site's things: the ground, never the building.
  ...SITE_TOOLS,
  // CNT-60: party walls and the neighbours round the plan, after the site's tools.
  ...CONTEXT_TOOLS,
  // CNT-50: the plan's name, the site's name and address, its language, units and north, and the floors' names.
  setPlanTool,
  // VEW-67: the trace image under the plan, drawn only: no part of the building.
  placeTraceTool,
  // SHT-22: writing on the drawing and its sketch, never the building or the ground.
  annotateTool,
  // VEW-3: changes the plan's saved views only, never the building: the last of the changes.
  saveViewTool,
]

async function answer(tool: GridTool, raw: unknown, context: ToolContext): Promise<ToolAnswer> {
  try {
    const args = readArgs(tool, raw)
    // CMD-39: how much of the answer to give is the server's to apply, not the tool's.
    const whole = !Object.hasOwn(tool.args, WHOLE_ARG_NAME) && args[WHOLE_ARG_NAME] === true
    const page = Object.hasOwn(tool.args, PAGE_ARG_NAME) ? undefined : checkPage(args)
    if (!Object.hasOwn(tool.args, WHOLE_ARG_NAME)) delete args[WHOLE_ARG_NAME]
    if (!Object.hasOwn(tool.args, PAGE_ARG_NAME)) delete args[PAGE_ARG_NAME]
    // MSG-34: the answer's language, read here for a tool with no language of its own, and the
    // languages Grid ships loaded, so the plan's own can be said as soon as the tool reads it.
    const own = !serverReadsLanguage(tool)
    const asked = askedAnswerLanguage(own ? undefined : args[LANGUAGE_ARG_NAME])
    if (asked === null) throw new ToolRefusal(`language takes a language tag, such as en, es, de or pt-BR: ${JSON.stringify(String(args[LANGUAGE_ARG_NAME]).slice(0, 32))} is none.`)
    if (!own) delete args[LANGUAGE_ARG_NAME]
    await loadShipped(asked ?? (own ? askedAnswerLanguage(args[LANGUAGE_ARG_NAME]) ?? undefined : undefined))
    const spoken: Spoken = {}
    const call: ToolContext = { ...context, ...(asked === undefined ? {} : { language: asked }), spoken }
    // MSG-24: no call says another plan's words: the plan a call reads hands its own (`languageFor`).
    setPlanWords(undefined)
    // CMD-41: the plan's revision on every answer about it; a change queued, locked and held to based_on.
    // The words tool writes the plan's display, so it is a change here too.
    const writes = tool.hint === 'change-plan' || tool.name === WORDS_TOOL_NAME
    // MSG-24: the keys Grid said in a language with no word for them are said once, at the end.
    const guarded = await guardedRun(tool, args, call, writes, () => listenForKeys(() => tool.run(args, call)))
    const { result: made, keys } = guarded.answer
    // MSG-34: the language the answer is in: the one asked, else the plan's, else English.
    const language: Language = (own ? askedAnswerLanguage(args[LANGUAGE_ARG_NAME]) : asked) ?? spoken.display?.language ?? DEFAULT_LANGUAGE
    // grid_words lists Grid's words for the agent to translate: it closes with neither line.
    const closing = tool.name === WORDS_TOOL_NAME ? [] : [wordsHint(keys, hasWording), notInLanguage(language, keys)].filter((line): line is string => line !== null)
    const result = labelled(closing.length === 0 ? made : { ...made, text: [made.text, ...closing].join('\n') }, !LABEL_SILENT_TOOLS.has(tool.name))
    // CMD-22: the figures in the data are written as the text writes them, once, here.
    const shaped = shapedData(tool, args, result.data)
    // CMD-39: kept to the size an agent's host takes, unless asked for whole; its notes in the answer's language.
    const bounded = whole ? { text: result.text, data: shaped } : withinBudget(tool, { ...args, [LANGUAGE_ARG_NAME]: language }, result.text, shaped, page)
    const revised = guarded.revision === null || guarded.file === null ? null : { revision: guarded.revision, footnote: revisionLine(guarded.file, guarded.revision) }
    return {
      text: bounded.text,
      data: revised === null ? bounded.data : { ...bounded.data, [REVISION_DATA_NAME]: revised.revision },
      ...(result.image ? { image: result.image } : {}),
      ...(result.images ? { images: result.images } : {}),
      ...(revised === null ? {} : { footnote: revised.footnote }),
    }
  } catch (error) {
    if (error instanceof ToolRefusal || error instanceof RevisionRefused || error instanceof PageRefused || error instanceof CanvasMissing || error instanceof FontsMissing) return { text: error.message, isError: true }
    throw error
  }
}

/**
 * MSG-34: the one line an answer in a language other than English closes with when the tool said
 * none of its own words in it: its sentences are still English, and the codes and figures are
 * the same in every language.
 */
function notInLanguage(language: Language, keys: ReadonlyMap<Language, ReadonlySet<MessageKey>>): string | null {
  if (language === DEFAULT_LANGUAGE || [...(keys.get(language) ?? [])].some((key) => !FRAME_KEYS.some((prefix) => key.startsWith(prefix)))) return null
  return say(language, 'tool.answer.inEnglish')
}

/** MSG-34: keys that frame an answer (a note about it, the language a write recorded) and say nothing of whether its own words are in the language. */
const FRAME_KEYS: readonly string[] = ['tool.answer.', 'tool.budget.', 'write.language.']

let common: ReadonlySet<string> | undefined
/** CMD-52: the arguments many tools describe alike, listed short, worked out once over every tool. */
function commonDescriptions(): ReadonlySet<string> {
  common ??= commonArgDescriptions(GRID_TOOLS)
  return common
}

export function serverTool(tool: GridTool, context: ToolContext): ServerTool {
  // CMD-52: the list gives each tool short; grid_help gives it whole (toolDefinition).
  const definition = listedDefinition(tool, commonDescriptions())
  return {
    definition,
    call: (raw, request) => answer(tool, raw, request?.protocolVersion === undefined ? context : { ...context, protocolVersion: request.protocolVersion }),
  }
}

/**
 * The tools for a project folder, or for the reason there is none: then every call that needs
 * a file answers with that reason. CMD-52: with groups, the tools of those groups only
 * (`grid mcp --tools`), grid_project and grid_help always.
 */
export function projectTools(project: Project | PathRefused, groups?: readonly ToolGroup[]): ServerTool[] {
  const listed = GRID_TOOLS.filter((tool) => inGroups(tool, groups))
  const context: ToolContext = { project, tools: { all: GRID_TOOLS, listed: new Set(listed.map((tool) => tool.name)), groups: groups === undefined ? null : [...groups] } }
  return listed.map((tool) => serverTool(tool, context))
}

/**
 * VEW-4: the resources of `grid serve`: the preview page, an MCP App that `grid_preview` names. The
 * page is loaded only when a host reads it; it holds everything it needs, and loads nothing.
 */
export function projectResources(): ServerResource[] {
  return [
    {
      definition: {
        uri: PREVIEW_RESOURCE_URI,
        name: 'grid-preview',
        title: 'Grid preview',
        description: 'The plan in 2D and 3D, shared with the agent: the person clicks a part to select it, and the agent frames a room or picks parts out (grid_preview).',
        mimeType: PREVIEW_RESOURCE_MIME,
      },
      read: async () => ({ text: (await import('@ongrid/viewer/src/page/previewPage')).previewPageHtml(), _meta: { ui: { prefersBorder: true } } }),
    },
    // CMD-7: the guide for agents and the plan's JSON Schema.
    ...guideResources(),
    // CMD-38: the whole rooms grammar, each topic with an example.
    {
      definition: {
        uri: ROOMS_GRAMMAR_URI,
        name: 'grid-rooms-grammar',
        title: 'Rooms text: the whole grammar',
        description: 'Every line rooms text takes, by topic, with an example each: floors, copies and through, polygons, curved walls, raw parts, outdoor rooms, heights, open sides, roofs and repeated units. grid_write_rooms carries the same in its rooms argument.',
        mimeType: 'text/markdown',
      },
      read: async () => ({ text: roomsGrammarMarkdown() }),
    },
  ]
}
