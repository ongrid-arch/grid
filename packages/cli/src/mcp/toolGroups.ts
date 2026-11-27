/**
 * CMD-52: the tool groups `grid mcp --tools` lists, for an app or an agent that needs one part of
 * Grid. `grid_project` and `grid_help` are in every list. A tool not named here is in the group
 * of its hint (a reading tool `view`, a file written beside the plan `write`, a change `edit`),
 * so a tool another change adds lands in a group without an edit here.
 */
import { UsageError } from '../command/options'
import type { GridTool, Hint } from './toolkit'

export const TOOL_GROUPS = ['view', 'areas', 'write', 'edit'] as const
export type ToolGroup = (typeof TOOL_GROUPS)[number]

/** What each group is for, for `grid_help` and the option's help. */
export const GROUP_SUMMARIES: Readonly<Record<ToolGroup, string>> = {
  view: 'Read, show and check a plan: describe, view, check, compare, diff, the preview, export and the sheet.',
  areas: 'Measure a plan: areas, take-off, schedules, fields, find, count and measure.',
  write: 'Write a plan: from rooms text, the brief, a building, a fit-out, the plan, site and trace settings.',
  edit: 'Change a plan already written: rooms, walls, openings, items, stairs, phases, facts, undo and restore.',
}

/** The tools every list holds, whatever the groups. */
export const ALWAYS_LISTED: ReadonlySet<string> = new Set(['grid_project', 'grid_help'])

/** The tools whose group is not the one their hint gives. */
const NAMED: Readonly<Record<string, ToolGroup>> = {
  grid_areas: 'areas',
  grid_takeoff: 'areas',
  grid_schedule: 'areas',
  grid_fields: 'areas',
  grid_find: 'areas',
  grid_count: 'areas',
  grid_measure: 'areas',
  grid_view: 'view',
  grid_preview: 'view',
  grid_preview_sync: 'view',
  grid_export: 'view',
  grid_sheet: 'view',
  grid_mark_seen: 'view',
  grid_words: 'view',
  grid_save_view: 'view',
  grid_mark_start: 'edit',
  grid_phase_from: 'edit',
  grid_write_rooms: 'write',
  grid_write_building: 'write',
  grid_start_fit_out: 'write',
  grid_set_plan: 'write',
  grid_set_site: 'write',
  grid_change_site: 'write',
  grid_place_trace: 'write',
  grid_set_building: 'write',
  grid_set_levels: 'write',
}

const BY_HINT: Readonly<Record<Hint, ToolGroup>> = { read: 'view', 'write-file': 'write', 'change-plan': 'edit' }

/** The group a tool is listed in. */
export function groupOf(tool: Pick<GridTool, 'name' | 'hint'>): ToolGroup {
  return NAMED[tool.name] ?? BY_HINT[tool.hint]
}

/** Whether a list of the groups given holds the tool; every tool when no groups are given. */
export function inGroups(tool: Pick<GridTool, 'name' | 'hint'>, groups: readonly ToolGroup[] | undefined): boolean {
  return groups === undefined || ALWAYS_LISTED.has(tool.name) || groups.includes(groupOf(tool))
}

/** The groups `--tools` names, split at commas; a group Grid does not know is refused by name. */
export function readToolGroups(value: string): ToolGroup[] {
  const names = value.split(',').map((name) => name.trim().toLowerCase()).filter((name) => name !== '')
  if (names.length === 0) throw new UsageError(`--tools takes one or more of ${TOOL_GROUPS.join(', ')}, split at commas.`)
  const unknown = names.filter((name) => !(TOOL_GROUPS as readonly string[]).includes(name))
  if (unknown.length > 0) throw new UsageError(`--tools takes ${TOOL_GROUPS.join(', ')}, split at commas: ${unknown.length === 1 ? 'one group named is' : `${unknown.length} groups named are`} none of them.`)
  return [...new Set(names as ToolGroup[])]
}
