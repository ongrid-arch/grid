/**
 * VEW-83: one of Grid's tables written as a file a spreadsheet opens as it is: CSV in the
 * person's dialect, or an XLSX workbook of one sheet. Pure: it takes the CSV the reading tools
 * already write (`quantities/units.ts`) and gives the file's text or bytes, so nothing here
 * measures anything and a file never says other than the tool's CSV.
 *
 * - The header is the first row and the label the last, in one cell (MSG-3).
 * - A decimal comma splits fields with semicolons, as a spreadsheet set to a comma locale reads
 *   them; a point, with commas.
 * - A cell a spreadsheet would read as a formula stays text: in a CSV with the quote mark the
 *   tools' CSV gives it, in an XLSX as a string cell, which a spreadsheet never runs.
 * - The XLSX is Office Open XML written here into the zip writer the bundle uses, so no
 *   dependency is added: one sheet, the header bold and frozen, numbers as numbers.
 */
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/floorplan/geometry'
import type { DecimalMark } from '@ongrid/floorplan/types/units'
import { zip } from '../distribution/zip'

export type TableCell = string | number | null

/** A table read back from Grid's CSV: its header, its rows, and the label it carries. */
export interface Table {
  readonly header: readonly string[]
  readonly rows: readonly (readonly TableCell[])[]
}

/** The CSV's records, each a list of its fields as written, quotes taken off. */
function records(text: string): string[][] {
  const out: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  let i = 0
  const body = text.replace(/^﻿/, '')
  while (i < body.length) {
    const c = body[i]!
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') {
        field += '"'
        i += 2
        continue
      }
      if (c === '"') quoted = false
      else field += c
      i++
      continue
    }
    if (c === '"' && field === '') quoted = true
    else if (c === ',') {
      record.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && body[i + 1] === '\n') i++
      record.push(field)
      out.push(record)
      record = []
      field = ''
    } else field += c
    i++
  }
  if (field !== '' || record.length > 0) {
    record.push(field)
    out.push(record)
  }
  return out
}

/** A number as `quantities/units.ts` writes one into a CSV; a text cell is never written so. */
const NUMBER_CELL = /^-?\d+(?:\.\d+)?$/

/**
 * Grid's own CSV (a reading tool's `format=csv` answer) read back as a table: the first row is
 * the header, a row that is the label alone is set aside, and a field written as a number is a
 * number again. An empty field is a missing value.
 */
export function readGridCsv(text: string): Table {
  const all = records(text).filter((record) => !(record.length === 1 && record[0] === GENERAL_GUIDANCE_LABEL))
  const [header = [], ...rows] = all
  return { header, rows: rows.map((row) => row.map((field) => (field === '' ? null : NUMBER_CELL.test(field) ? Number(field) : field))) }
}

/** The CSV dialect a decimal mark asks for: its field separator and its decimal mark. */
export function csvDialect(decimal: DecimalMark): { readonly separator: ',' | ';'; readonly decimal: DecimalMark } {
  return { separator: decimal === 'comma' ? ';' : ',', decimal }
}

function dialectField(value: TableCell, separator: string, decimal: DecimalMark): string {
  if (value === null) return ''
  const text = typeof value === 'number' ? (decimal === 'comma' ? String(value).replace('.', ',') : String(value)) : value
  return text.includes(separator) || /["\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * The table as CSV text in the dialect of the decimal mark: the header first, the label last,
 * one line each, ending in a newline. A file adds `CSV_BYTE_ORDER_MARK` in front.
 */
export function tableCsv(table: Table, decimal: DecimalMark): string {
  const { separator } = csvDialect(decimal)
  return [table.header, ...table.rows, [GENERAL_GUIDANCE_LABEL]].map((row) => row.map((cell) => dialectField(cell, separator, decimal)).join(separator)).join('\n') + '\n'
}

/** Put before a CSV file's text, so a spreadsheet reads it as UTF-8 (accents, m²). */
export const CSV_BYTE_ORDER_MARK = '﻿'

// ---------------------------------------------------------------------------------------------
// XLSX

/** Text as XML character data: the five marks escaped, and the characters XML cannot hold left out. */
function xmlText(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** A column's letters: 0 is A, 25 is Z, 26 is AA. */
export function columnName(index: number): string {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}

/** The quote mark the tools' CSV puts before a text a spreadsheet would read as a formula. */
const FORMULA_GUARD = /^'(?=[=+\-@\t\r])/

const BOLD_STYLE = 1

function cellXml(value: TableCell, ref: string, bold: boolean): string {
  const style = bold ? ` s="${BOLD_STYLE}"` : ''
  if (value === null) return bold ? `<c r="${ref}"${style}/>` : ''
  if (typeof value === 'number') return `<c r="${ref}"${style}><v>${value}</v></c>`
  // A string cell is never a formula, so the CSV's guard is not needed in it.
  const text = value.replace(FORMULA_GUARD, '')
  const space = text !== text.trim() || /\n/.test(text) ? ' xml:space="preserve"' : ''
  return `<c r="${ref}"${style} t="inlineStr"><is><t${space}>${xmlText(text)}</t></is></c>`
}

/** A sheet's name: at most 31 characters, none of the seven a workbook refuses. */
export function sheetName(name: string): string {
  const clean = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31)
  return clean === '' ? 'Grid' : clean
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'

function sheetXml(table: Table): string {
  const rows = [table.header, ...table.rows, [GENERAL_GUIDANCE_LABEL]]
  const width = Math.max(1, ...rows.map((row) => row.length))
  const body = rows.map((row, r) => {
    const cells = row.map((cell, c) => cellXml(cell, `${columnName(c)}${r + 1}`, r === 0)).join('')
    return `<row r="${r + 1}">${cells}</row>`
  }).join('')
  // The header stays in view as the rows scroll.
  const pane = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
  return `${XML_HEAD}<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><dimension ref="A1:${columnName(width - 1)}${rows.length}"/>${pane}<sheetData>${body}</sheetData></worksheet>`
}

const STYLES_XML = `${XML_HEAD}<styleSheet xmlns="${MAIN_NS}">`
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>'

const CONTENT_TYPES_XML = `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
  + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
  + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
  + '</Types>'

const ROOT_RELS_XML = `${XML_HEAD}<Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`

const WORKBOOK_RELS_XML = `${XML_HEAD}<Relationships xmlns="${PACKAGE_REL_NS}">`
  + `<Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/>`
  + `<Relationship Id="rId2" Type="${REL_NS}/styles" Target="styles.xml"/>`
  + '</Relationships>'

/** The table as an XLSX workbook of one sheet, named `name`. The same table gives the same bytes. */
export function tableXlsx(table: Table, name: string): Uint8Array {
  const workbook = `${XML_HEAD}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets><sheet name="${xmlText(sheetName(name))}" sheetId="1" r:id="rId1"/></sheets></workbook>`
  const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
  return zip([
    { path: '[Content_Types].xml', data: encode(CONTENT_TYPES_XML) },
    { path: '_rels/.rels', data: encode(ROOT_RELS_XML) },
    { path: 'xl/workbook.xml', data: encode(workbook) },
    { path: 'xl/_rels/workbook.xml.rels', data: encode(WORKBOOK_RELS_XML) },
    { path: 'xl/styles.xml', data: encode(STYLES_XML) },
    { path: 'xl/worksheets/sheet1.xml', data: encode(sheetXml(table)) },
  ])
}
