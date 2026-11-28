import { describe, expect, it } from 'vitest'
import { csv } from '../../quantities/units'
import { unzip } from '../../distribution/__tests__/unzip'
import { columnName, CSV_BYTE_ORDER_MARK, readGridCsv, sheetName, tableCsv, tableXlsx } from '../table'

/** VEW-83: Grid's tables written as files a spreadsheet opens as they are. */
const LABEL = 'General guidance, not your local rules'

const grid = csv(['room', 'net m2', 'note'], [['Kitchen', 12.5, 'north, by the yard'], ['Hall', 4, '=SUM(A1)'], ['Store', null, 'say "hi"'], ['101', -0.25, '']])

describe('a CSV table (VEW-83)', () => {
  it('has its header on line 1 and the label in its last row', () => {
    const lines = grid.trimEnd().split('\n')
    expect(lines[0]).toBe('room,net m2,note')
    expect(lines.at(-1)).toBe(`"${LABEL}"`)
  })

  it('is read back as the tools wrote it: numbers as numbers, the label set aside, the formula guard kept', () => {
    const table = readGridCsv(grid)
    expect(table.header).toEqual(['room', 'net m2', 'note'])
    expect(table.rows).toEqual([
      ['Kitchen', 12.5, 'north, by the yard'],
      ['Hall', 4, "'=SUM(A1)"],
      ['Store', null, 'say "hi"'],
      [101, -0.25, null],
    ])
  })

  it('is written with commas and points, or with semicolons and decimal commas', () => {
    const table = readGridCsv(grid)
    expect(tableCsv(table, 'point')).toBe(grid)
    const comma = tableCsv(table, 'comma').trimEnd().split('\n')
    expect(comma).toEqual([
      'room;net m2;note',
      'Kitchen;12,5;north, by the yard',
      "Hall;4;'=SUM(A1)",
      'Store;;"say ""hi"""',
      '101;-0,25;',
      LABEL,
    ])
    // Read back by a reader that splits on the semicolon, every row has the header's width.
    expect(comma.slice(0, -1).every((line) => line.replace(/"[^"]*"/g, '').split(';').length === 3)).toBe(true)
    expect(CSV_BYTE_ORDER_MARK.charCodeAt(0)).toBe(0xfeff)
    expect(readGridCsv(CSV_BYTE_ORDER_MARK + grid).header[0]).toBe('room')
  })
})

describe('an XLSX table (VEW-83)', () => {
  const files = unzip(tableXlsx(readGridCsv(grid), 'areas'))
  const text = (name: string): string => files.get(name)!.data.toString('utf8')

  it('is a workbook of one sheet named after the table', () => {
    expect([...files.keys()].sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml'])
    expect(text('xl/workbook.xml')).toContain('<sheet name="areas" sheetId="1" r:id="rId1"/>')
    expect(text('[Content_Types].xml')).toContain('/xl/worksheets/sheet1.xml')
  })

  it('holds numbers as numbers, text as text never run as a formula, the header bold and frozen, the label last', () => {
    const sheet = text('xl/worksheets/sheet1.xml')
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr"><is><t>room</t></is></c>')
    expect(sheet).toContain('<c r="B2"><v>12.5</v></c>')
    expect(sheet).toContain('<c r="C3" t="inlineStr"><is><t>=SUM(A1)</t></is></c>')
    expect(sheet).toContain('<c r="C4" t="inlineStr"><is><t>say &quot;hi&quot;</t></is></c>')
    expect(sheet).toContain('<c r="A5"><v>101</v></c>')
    expect(sheet).not.toContain('<f>')
    expect(sheet).toContain('state="frozen"')
    expect(sheet).toContain(`<row r="6"><c r="A6" t="inlineStr"><is><t>${LABEL}</t></is></c></row>`)
    expect(sheet).toContain('<dimension ref="A1:C6"/>')
  })

  it('gives the same bytes for the same table', () => {
    expect(Buffer.from(tableXlsx(readGridCsv(grid), 'areas')).equals(Buffer.from(tableXlsx(readGridCsv(grid), 'areas')))).toBe(true)
  })

  it('names columns and sheets as a workbook takes them', () => {
    expect([0, 25, 26, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'ZZ', 'AAA'])
    expect(sheetName('rooms/ground: [a]')).toBe('rooms ground   a')
    expect(sheetName('')).toBe('Grid')
  })
})
