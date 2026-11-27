/**
 * HND-9: who sits where is kept in a file of its own beside the plan, linked to its rooms, and
 * no export carries it. The exports are read back as bytes and searched for every name.
 */
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { exportIntoProject, GRID_EXPORT_FORMATS } from '../../command/export'
import { runGrid } from '../../command/main'
import { loadPlan } from '../../command/plan'
import { openProject, PathRefused, type Project } from '../../fs/projectFiles'
import { linkSeats, occupancyFileOf, occupancyText, OccupancyRefused, parseOccupancy, readOccupancy } from '../occupancy'

const PLAN = 'two-bed-flat.json'
const sample = readFileSync(resolve(__dirname, '../../../fixtures', PLAN), 'utf8')
const planRooms = (JSON.parse(sample) as { rooms: Array<{ id: string; name: string }> }).rooms

/** Names no plan, file name or export of Grid's would hold by chance. */
const PEOPLE = ['Wenceslao Quiroga-Ibarzábal', 'Oyelaran Thistlewood', 'Zébulon Marchetti']

const occupancy = {
  version: '1',
  seats: [
    { room: planRooms[0]!.id, occupants: [PEOPLE[0]] },
    { room: planRooms[1]!.id, desk: 'Desk by the window', occupants: [PEOPLE[1], PEOPLE[2]] },
  ],
}

let root: string
let project: Project

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'grid-occupancy-')))
  project = openProject(root, root)
  writeFileSync(join(root, PLAN), sample)
  writeFileSync(join(root, 'two-bed-flat.occupancy.json'), JSON.stringify(occupancy, null, 2))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('the occupancy file', () => {
  it('sits beside its plan, named after it', () => {
    expect(occupancyFileOf('plan.json')).toBe('plan.occupancy.json')
    expect(occupancyFileOf(join('a', 'Flat.JSON'))).toBe(join('a', 'Flat.occupancy.json'))
    expect(occupancyFileOf('plan')).toBe('plan.occupancy.json')
  })

  it('links each seat to a room of the plan, by id, with its desk', () => {
    const read = readOccupancy(project, PLAN)!
    expect(read.file).toBe(join(root, 'two-bed-flat.occupancy.json'))
    const links = linkSeats(loadPlan(project, PLAN).plan, read.occupancy)
    expect(links.unlinked).toEqual([])
    expect(links.linked).toEqual([
      { seat: 0, room: planRooms[0]!.id, roomName: planRooms[0]!.name, occupants: [PEOPLE[0]] },
      { seat: 1, room: planRooms[1]!.id, roomName: planRooms[1]!.name, desk: 'Desk by the window', occupants: [PEOPLE[1], PEOPLE[2]] },
    ])
    const text = occupancyText('two-bed-flat.occupancy.json', links)
    expect(text).toContain(`${planRooms[1]!.name}, Desk by the window: ${PEOPLE[1]}, ${PEOPLE[2]}`)
    expect(text).toContain('no export or sheet carries it')
  })

  it('names a seat whose room the plan does not have', () => {
    const links = linkSeats(loadPlan(project, PLAN).plan, parseOccupancy({ version: '1', seats: [{ room: 'attic', occupants: [PEOPLE[0]] }] }))
    expect(links.linked).toEqual([])
    expect(occupancyText('x', links)).toContain('seats[0] names room "attic", which the plan does not have')
  })

  it('is no file at all for a plan that has none', () => {
    writeFileSync(join(root, 'other.json'), sample)
    expect(readOccupancy(project, 'other.json')).toBeNull()
  })

  it.each([
    [{ version: '1', seats: [{ room: 'living', occupants: [`${PEOPLE[0]}\n`] }] }, 'seats[0].occupants[0] holds a line break'],
    [{ version: '1', seats: [{ room: 'living', occupants: PEOPLE[0] }] }, 'seats[0].occupants must be a list of names'],
    [{ version: '1', seats: [{ room: PEOPLE[0], name: PEOPLE[1], occupants: [] }] }, 'seats[0] holds a field Grid does not know'],
    [{ version: '1', seats: [{ room: '', occupants: [PEOPLE[0]] }] }, 'seats[0].room is empty'],
    [{ version: '2', seats: [] }, 'version must be "1"'],
    [[PEOPLE[0]], 'it must be a JSON object'],
  ])('refuses a file that is wrong, naming the place and never the name (%#)', (raw, words) => {
    writeFileSync(join(root, 'two-bed-flat.occupancy.json'), JSON.stringify(raw))
    let message = ''
    try {
      readOccupancy(project, PLAN)
    } catch (error) {
      expect(error).toBeInstanceOf(OccupancyRefused)
      message = (error as Error).message
    }
    expect(message).toContain(words)
    for (const person of PEOPLE) expect(message).not.toContain(person)
  })

  it('refuses a file that is not JSON without quoting it', () => {
    writeFileSync(join(root, 'two-bed-flat.occupancy.json'), `{ "seats": [ ${PEOPLE[0]} ] }`)
    expect(() => readOccupancy(project, PLAN)).toThrow(OccupancyRefused)
    expect(() => readOccupancy(project, PLAN)).not.toThrow(PEOPLE[0])
  })

  it.skipIf(process.platform === 'win32')('is read only inside the project: a link out of it is refused', () => {
    const outside = realpathSync.native(mkdtempSync(join(tmpdir(), 'grid-occupancy-out-')))
    try {
      writeFileSync(join(outside, 'theirs.json'), JSON.stringify(occupancy))
      rmSync(join(root, 'two-bed-flat.occupancy.json'))
      symlinkSync(join(outside, 'theirs.json'), join(root, 'two-bed-flat.occupancy.json'))
      expect(() => readOccupancy(project, PLAN)).toThrow(PathRefused)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })
})

describe('the exports', () => {
  // VEW-80: the plan's geometry as data too.
  it.each(GRID_EXPORT_FORMATS)('%s carries no occupant name, and does carry a room name or id', (format) => {
    const done = exportIntoProject(project, PLAN, format, {})
    const bytes = readFileSync(done.written)
    // Searched as bytes in UTF-8 and in Latin-1, so a name with an accent is found either way.
    const asText = [bytes.toString('utf8'), bytes.toString('latin1')]
    for (const person of PEOPLE) {
      for (const text of asText) {
        expect(text).not.toContain(person)
        for (const word of person.split(/[\s-]/)) expect(text).not.toContain(word)
      }
    }
    expect(asText[0]).not.toContain('Desk by the window')
    // What the guide warns of: the DXF writes each room's name, the IFC its name and id, OBJ
    // and GLB its id. A name put in either would travel.
    const room = planRooms[0]!
    if (format === 'dxf' || format === 'ifc' || format === 'geojson' || format === 'json') expect(asText[0]).toContain(room.name)
    if (format !== 'dxf') expect(asText[1]).toContain(room.id)
  })
})

describe('grid occupancy', () => {
  async function run(args: string[]): Promise<{ code: number; out: string; err: string }> {
    let out = ''
    let err = ''
    const code = await runGrid(['occupancy', ...args], { stdout: (data) => { out += String(data) }, stderr: (text) => { err += text }, stdoutIsTerminal: false, cwd: root })
    return { code, out, err }
  }

  it('lists who sits where by room name', async () => {
    const done = await run([PLAN])
    expect(done).toMatchObject({ code: 0, err: '' })
    expect(done.out).toContain(`${planRooms[0]!.name}: ${PEOPLE[0]}`)
  })

  it('is refused, saying where the file goes, for a plan with none', async () => {
    writeFileSync(join(root, 'other.json'), sample)
    const done = await run(['other.json'])
    expect(done).toMatchObject({ code: 1, out: '' })
    expect(done.err).toContain('There is no other.occupancy.json')
  })
})
