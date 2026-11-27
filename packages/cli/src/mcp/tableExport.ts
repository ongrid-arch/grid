/**
 * VEW-83: one of Grid's tables written as a CSV or XLSX file, for `grid_export format=csv|xlsx`
 * and `grid export --csv`. Each table is a reading tool's own CSV (`format=csv`): this file says
 * which tool and arguments give it, reads its CSV back (`export/table.ts`) and writes the file in
 * the person's dialect into `exports/` beside the plan, or to `out`. It measures nothing.
 */
import path from 'path'
import { planFloors, resolveFloor, type PlanState } from '@ongrid/floorplan/geometry'
import { ALL_FLOORS, exportFloorId, exportNameInState, exportNameOf, ExportWriteFailed, floorWord, writeBesidePlan } from '../command/export'
import { CSV_BYTE_ORDER_MARK, readGridCsv, tableCsv, tableXlsx, type Table } from '../export/table'
import { PathRefused, quoted } from '../fs/projectFiles'
import { displayFor } from '../quantities/units'
import { toolLanguage } from './answerLanguage'
import { READ_TOOLS } from './readTools'
import { readArgs, readPlan, ToolRefusal, type GridTool, type ToolContext } from './toolkit'

/** The file formats a table is written as. */
export const TABLE_FORMATS = ['csv', 'xlsx'] as const
export type TableFormat = (typeof TABLE_FORMATS)[number]

export function isTableFormat(value: unknown): value is TableFormat {
  return (TABLE_FORMATS as readonly unknown[]).includes(value)
}

/** The tables Grid writes as a file, each the CSV of one reading tool called so. */
export const TABLE_CALLS = {
  estimate: { tool: 'grid_takeoff', args: { for: 'estimate' } },
  takeoff: { tool: 'grid_takeoff', args: {} },
  areas: { tool: 'grid_areas', args: {} },
  doors: { tool: 'grid_schedule', args: { of: 'doors' } },
  windows: { tool: 'grid_schedule', args: { of: 'windows' } },
  rooms: { tool: 'grid_schedule', args: { of: 'rooms' } },
  finishes: { tool: 'grid_schedule', args: { of: 'finishes' } },
} as const satisfies Readonly<Record<string, { readonly tool: GridTool['name']; readonly args: Readonly<Record<string, string>> }>>

export type TableWhat = keyof typeof TABLE_CALLS
export const TABLE_WHATS = Object.keys(TABLE_CALLS) as readonly TableWhat[]

export function isTableWhat(value: unknown): value is TableWhat {
  return typeof value === 'string' && Object.hasOwn(TABLE_CALLS, value)
}

export interface TableRequest {
  readonly plan: string
  readonly format: TableFormat
  readonly what: TableWhat
  readonly floor?: string
  readonly units?: string
  readonly decimal?: string
  readonly state?: PlanState | 'both'
  readonly out?: string
}

export interface TableDone {
  /** The real path written. */
  readonly written: string
  readonly table: Table
  /** The table as CSV text in the file's dialect, without the byte-order mark. */
  readonly csv: string
  readonly separator: ',' | ';'
  readonly note?: string
}

/** The reading tool that gives a table. */
function toolOf(what: TableWhat): GridTool {
  const name = TABLE_CALLS[what].tool
  const tool = READ_TOOLS.find((one) => one.name === name)
  if (tool === undefined) throw new Error(`${name} is not a reading tool.`)
  return tool
}

/**
 * The file's name in `exports/`: the plan's, the floor's when one of several is asked for, then
 * the table's (`plan-areas.csv`, `plan-ground-rooms.xlsx`), and the state's last.
 */
function tableFileName(context: ToolContext, request: TableRequest): { fileName: string; note?: string } {
  let floorPart: string | number | null = null
  if (request.floor !== undefined) {
    const plan = readPlan(context, request.plan).loaded.plan
    const floors = planFloors(plan)
    const id = exportFloorId(plan, request.floor)
    if (floors.length > 1 && id !== undefined) {
      const at = floors.findIndex((floor) => floor.id === resolveFloor(plan, id))
      floorPart = at < 0 ? null : (floorWord(floors[at]!) ?? at + 1)
    }
  }
  const made = exportNameOf(request.plan, request.format, floorPart)
  const dot = made.fileName.lastIndexOf('.')
  const named = `${made.fileName.slice(0, dot)}-${request.what}${made.fileName.slice(dot)}`
  const fileName = request.state === undefined || request.state === 'both' ? named : exportNameInState(named, request.state)
  return made.note === undefined ? { fileName } : { fileName, note: made.note }
}

/**
 * Writes the table: calls its reading tool for its CSV, reads it back, and writes it as CSV in
 * the decimal mark's dialect (with a byte-order mark) or as XLSX, into `exports/` beside the plan
 * or to `out`. A refusal of the reading tool is the export's.
 */
export async function writeTable(context: ToolContext, request: TableRequest): Promise<TableDone> {
  if (request.floor === ALL_FLOORS) throw new ToolRefusal(`floor all writes a drawing per floor; a ${request.format} table holds one floor, or every floor when floor is left out.`)
  if (request.out !== undefined && path.extname(request.out).toLowerCase() !== `.${request.format}`) {
    throw new ToolRefusal(`out ${quoted(request.out)} does not end in .${request.format}: name a .${request.format} file.`)
  }
  const tool = toolOf(request.what)
  if (request.state !== undefined && !Object.hasOwn(tool.args, 'state')) throw new ToolRefusal(`state does not apply to what=${request.what}: leave it out.`)
  const given: Record<string, unknown> = {
    plan: request.plan,
    ...TABLE_CALLS[request.what].args,
    format: 'csv',
    ...(request.floor === undefined ? {} : { floor: request.floor }),
    ...(request.units === undefined ? {} : { units: request.units }),
    ...(request.decimal === undefined ? {} : { decimal: request.decimal }),
    ...(request.state === undefined ? {} : { state: request.state }),
  }
  const answer = await tool.run(readArgs(tool, given), context)
  const table = readGridCsv(answer.text)
  const { project, loaded } = readPlan(context, request.plan)
  // The call's decimal mark, else the plan's display, else its language's.
  const decimal = displayFor(request.units, request.decimal, loaded.plan, toolLanguage(context, loaded.plan)).decimal
  const csv = tableCsv(table, decimal)
  const data = request.format === 'csv' ? CSV_BYTE_ORDER_MARK + csv : tableXlsx(table, request.what)
  const separator = decimal === 'comma' ? ';' : ','
  if (request.out !== undefined) {
    let written: string
    try {
      written = project.writeFile(request.out, data)
    } catch (error) {
      if (error instanceof PathRefused) throw error
      throw new ExportWriteFailed(`Can't write ${quoted(request.out)}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'its folder does not exist' : 'it cannot be written there'}. Nothing was written.`)
    }
    return { written, table, csv, separator }
  }
  const name = tableFileName(context, request)
  const written = writeBesidePlan(project, request.plan, name.fileName, data)
  return name.note === undefined ? { written, table, csv, separator } : { written, table, csv, separator, note: name.note }
}
