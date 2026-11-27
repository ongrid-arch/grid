import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { twoFloorHouse } from '@ongrid/floorplan/test-support/plans'
import { unzip } from '../../distribution/__tests__/unzip'
import { readGridCsv } from '../../export/table'
import { bench } from './replay/harness'

/** VEW-83: grid_export writes Grid's tables as CSV and XLSX files a spreadsheet opens as they are. */
const LABEL = 'General guidance, not your local rules'

describe('a table as a file from grid_export (VEW-83)', () => {
  const b = bench({ 'house.json': twoFloorHouse() })
  afterAll(() => b.close())
  const file = (name: string): Buffer => readFileSync(join(b.folder, name))

  it.each(['estimate', 'takeoff', 'areas', 'doors', 'windows', 'rooms', 'finishes'])('writes the %s table as CSV into exports/, its header on line 1, the label last', async (what) => {
    const reply = await b.call('grid_export', { plan: 'house.json', format: 'csv', what })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.data).toMatchObject({ written: `exports/house-${what}.csv`, format: 'csv', what, separator: ',' })
    const bytes = file(`exports/house-${what}.csv`)
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const text = bytes.toString('utf8').slice(1)
    // The CSV in the data is the file's, without its byte-order mark.
    expect(reply.data!['csv']).toBe(text)
    const lines = text.trimEnd().split('\n')
    expect(lines[0]).toBe((reply.data!['columns'] as string[]).join(','))
    expect(lines[0]).not.toContain(LABEL)
    expect(lines.at(-1)).toBe(`"${LABEL}"`)
    expect(reply.data!['rows']).toBe(lines.length - 2)
  })

  it('writes the same table as the reading tool gives as CSV', async () => {
    const asked = await b.call('grid_areas', { plan: 'house.json', format: 'csv' })
    const written = await b.call('grid_export', { plan: 'house.json', format: 'csv', what: 'areas' })
    expect(written.data!['csv']).toBe(asked.text)
    // VEW-83: the reading tool's CSV is in its data too, for a host that shows only the data.
    expect(asked.data!['csv']).toBe(asked.text)
    expect(asked.text.split('\n')[0]).toMatch(/^floor,room id,name/)
  })

  it('writes semicolons, decimal commas and millimetres for a decimal comma and mm', async () => {
    const reply = await b.call('grid_export', { plan: 'house.json', format: 'csv', what: 'doors', units: 'mm', decimal: 'comma' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.data!['separator']).toBe(';')
    const lines = (reply.data!['csv'] as string).trimEnd().split('\n')
    expect(lines[0]).toContain(';width mm;height mm;')
    expect(lines[0]).not.toContain(',')
    expect(lines.at(-1)).toBe(LABEL)
    const columns = lines[0]!.split(';')
    const width = lines[1]!.split(';')[columns.indexOf('width mm')]
    expect(Number(width)).toBeGreaterThan(500)
  })

  it('keeps an earlier revision when out names another file', async () => {
    await b.call('grid_export', { plan: 'house.json', format: 'csv', what: 'rooms', out: 'exports/rooms-rev-a.csv' })
    const second = await b.call('grid_export', { plan: 'house.json', format: 'csv', what: 'rooms', out: 'exports/rooms-rev-b.csv' })
    expect(second.data!['written']).toBe('exports/rooms-rev-b.csv')
    expect(existsSync(join(b.folder, 'exports/rooms-rev-a.csv'))).toBe(true)
    expect(existsSync(join(b.folder, 'exports/rooms-rev-b.csv'))).toBe(true)
    const into = await b.call('grid_export', { plan: 'house.json', format: 'csv', what: 'rooms' })
    expect(into.text).toContain('pass out to keep both')
  })

  it('writes an XLSX of one sheet named after the table, one floor named in its file name', async () => {
    const reply = await b.call('grid_export', { plan: 'house.json', format: 'xlsx', what: 'rooms', floor: 'first' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.data!['written']).toBe('exports/house-first-floor-rooms.xlsx')
    const parts = unzip(file('exports/house-first-floor-rooms.xlsx'))
    expect(parts.get('xl/workbook.xml')!.data.toString('utf8')).toContain('<sheet name="rooms"')
    const sheet = parts.get('xl/worksheets/sheet1.xml')!.data.toString('utf8')
    expect(sheet).toContain('<t>number</t>')
    expect(sheet).toContain(LABEL)
    expect(sheet).toContain('<t>Study</t>')
    expect(sheet).not.toContain('<t>Kitchen</t>')
    expect(reply.data!['csv']).toMatch(/^number,room id,name/)
  })

  it('rounds money to the currency', async () => {
    b.write('rates.json', { currency: 'JPY', rates: { floor: { rate: 1234.567, unit: 'm2' } } })
    const reply = await b.call('grid_export', { plan: 'house.json', format: 'csv', what: 'estimate' })
    expect(reply.isError, reply.text).toBe(false)
    const table = readGridCsv(reply.data!['csv'] as string)
    const amount = table.header.indexOf('amount')
    const priced = table.rows.filter((row) => row[0] === 'line' && row[amount] !== null)
    expect(priced.length).toBeGreaterThan(0)
    // The rate is as given; each amount and the total are whole yen.
    expect(priced.every((row) => row[table.header.indexOf('rate')] === 1234.567)).toBe(true)
    for (const row of priced) expect(Number.isInteger(row[amount])).toBe(true)
    const total = table.rows.find((row) => row[0] === 'total')!
    expect(Number.isInteger(total[amount])).toBe(true)
  })

  it('refuses a table with no what, a what with a drawing, floor all and options of the other kind', async () => {
    const none = await b.call('grid_export', { plan: 'house.json', format: 'csv' })
    expect(none.isError).toBe(true)
    expect(none.text).toContain('Pass what with format csv')
    const drawing = await b.call('grid_export', { plan: 'house.json', format: 'dxf', what: 'areas' })
    expect(drawing.isError).toBe(true)
    expect(drawing.text).toContain('what is for csv and xlsx only')
    const all = await b.call('grid_export', { plan: 'house.json', format: 'xlsx', what: 'areas', floor: 'all' })
    expect(all.isError).toBe(true)
    expect(all.text).toContain('floor all writes a drawing per floor')
    const roofs = await b.call('grid_export', { plan: 'house.json', format: 'csv', what: 'areas', roofs: false })
    expect(roofs.isError).toBe(true)
    expect(roofs.text).toContain('roofs is for drawings and models')
    const state = await b.call('grid_export', { plan: 'house.json', format: 'csv', what: 'takeoff', state: 'before' })
    expect(state.isError).toBe(true)
    expect(state.text).toContain('state does not apply to what=takeoff')
    const out = await b.call('grid_export', { plan: 'house.json', format: 'xlsx', what: 'areas', out: 'areas.csv' })
    expect(out.isError).toBe(true)
    expect(out.text).toContain('does not end in .xlsx')
  })
})
