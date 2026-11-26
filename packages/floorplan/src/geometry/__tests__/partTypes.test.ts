/**
 * CNT-15 (C24): named wall, door and window types, and room finishes, in the core. A part takes
 * what its type gives and keeps what it states itself; the reading says which (`typed`) and never
 * writes it back; a default names the type a part takes when it names none; a file in another
 * unit has its types read in metres; the drawing's check names a type that is not there; and the
 * IFC writes each type's material, and "Not stated" when none is given (lab AU3-4).
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, statedOpening, statedWall } from '../../types/floorplan'
import { readPlanParts } from '../../types/readParts'
import { readingNotes } from '../../types/reading'
import { flat } from '../../test-support/plans'
import { toIfc } from '../export/ifc'
import { openingTypeOf, roomFinishes, typeIssues, wallTypeOf } from '../partTypes'
import { validatePlan } from '../validate'
import { en, ofType, parseDoc as parseStep, ref, refs, str } from '../export/__tests__/step-reader'

type Raw = Record<string, unknown>

/** The 10 × 8 flat as a file holds it, its inside walls naming the stud type and stating no thickness. */
function typedFlat(): Raw {
  const plan = JSON.parse(JSON.stringify(flat())) as Raw & { walls: Raw[]; openings: Raw[] }
  for (const wall of plan.walls) {
    if (wall['kind'] !== 'interior') continue
    delete wall['thickness']
    wall['wallType'] = 'stud'
  }
  for (const opening of plan.openings) {
    if (opening['type'] !== 'door') continue
    delete opening['width']
    delete opening['height']
    opening['doorType'] = 'D80'
  }
  plan['types'] = {
    walls: [
      { id: 'stud', name: 'Stud partition 100', thickness: 0.1, height: 2.6, kind: 'partition', material: 'Plasterboard on timber studs' },
      { id: 'glass', name: 'Glass partition', thickness: 0.05, kind: 'partition', glazed: true, material: 'Laminated glass' },
      { id: 'brick', name: 'Brick 200', thickness: 0.2 },
    ],
    doors: [{ id: 'D80', name: 'Internal door 800', width: 0.8, height: 2.1, kind: 'single', material: 'Oak' }],
    windows: [{ id: 'W12', name: 'Casement 1200', width: 1.2, height: 1.2, sill: 0.9 }],
  }
  return plan
}

describe('CNT-15 a part takes what its type gives', () => {
  it('fills the thickness, height and kind a wall leaves out, and records which in typed', () => {
    const plan = parseFloorPlan(typedFlat())
    const inside = plan.walls.filter((w) => w.wallType === 'stud')
    expect(inside.length).toBeGreaterThan(2)
    for (const wall of inside) {
      expect(wall.thickness).toBe(0.1)
      // The flat states its walls' heights and kinds: those stay the wall's own.
      expect(wall.height).toBe(2.7)
      expect(wall.kind).toBe('interior')
      expect(wall.typed).toEqual(['thickness'])
      expect(wallTypeOf(plan, wall)?.name).toBe('Stud partition 100')
    }
  })

  it('changes every wall of the type when the type changes, and a wall\'s own value wins', () => {
    const raw = typedFlat() as Raw & { walls: Raw[]; types: { walls: Raw[] } }
    raw.types.walls[0]!['thickness'] = 0.12
    const own = raw.walls.find((w) => w['wallType'] === 'stud')!
    own['thickness'] = 0.15
    const plan = parseFloorPlan(raw)
    const stud = plan.walls.filter((w) => w.wallType === 'stud')
    expect(stud.filter((w) => w.id !== own['id']).every((w) => w.thickness === 0.12)).toBe(true)
    expect(stud.find((w) => w.id === own['id'])!.thickness).toBe(0.15)
    expect(stud.find((w) => w.id === own['id'])!.typed).toBeUndefined()
  })

  it('fills a door\'s size and kind from its type, and a type\'s height and kind when the wall states none', () => {
    const raw = typedFlat() as Raw & { walls: Raw[] }
    for (const wall of raw.walls) if (wall['wallType'] === 'stud') { delete wall['height']; delete wall['kind'] }
    const plan = parseFloorPlan(raw)
    const wall = plan.walls.find((w) => w.wallType === 'stud')!
    expect([wall.height, wall.kind]).toEqual([2.6, 'partition'])
    expect(wall.unstated).toBeUndefined()
    const door = plan.openings.find((o) => o.doorType === 'D80')!
    expect([door.width, door.height, door.kind]).toEqual([0.8, 2.1, 'single'])
    expect(door.typed).toEqual(['width', 'height', 'kind'])
    expect(openingTypeOf(plan, door)?.material).toBe('Oak')
  })

  it('writes a part back as its file states it: no value its type gave, and no typed', () => {
    const raw = typedFlat() as Raw & { walls: Raw[]; openings: Raw[] }
    const plan = parseFloorPlan(raw)
    const wall = plan.walls.find((w) => w.wallType === 'stud')!
    const stated = statedWall(wall) as Raw
    expect(stated).not.toHaveProperty('thickness')
    expect(stated).not.toHaveProperty('typed')
    expect(stated['wallType']).toBe('stud')
    const door = plan.openings.find((o) => o.doorType === 'D80')!
    const back = statedOpening(door) as Raw
    expect(Object.keys(back).sort()).toEqual(Object.keys(raw.openings.find((o) => o['id'] === door.id)!).sort())
  })

  it('takes the default for a part that names none, and writes no type back for it', () => {
    const raw = typedFlat() as Raw & { walls: Raw[]; types: Raw }
    const exteriorWall = raw.walls.find((w) => w['kind'] === 'exterior')!
    delete exteriorWall['thickness']
    raw.types['defaults'] = { walls: { exterior: 'brick' } }
    const plan = parseFloorPlan(raw)
    const read = plan.walls.find((w) => w.id === exteriorWall['id'])!
    expect([read.wallType, read.thickness]).toEqual(['brick', 0.2])
    expect(read.typed).toEqual(['wallType', 'thickness'])
    expect(statedWall(read)).not.toHaveProperty('wallType')
    // A wall that states its own thickness still takes the type, and keeps its thickness.
    const other = plan.walls.find((w) => w.kind === 'exterior' && w.id !== exteriorWall['id'])!
    expect([other.wallType, other.thickness]).toEqual(['brick', 0.2])
  })

  it('keeps a window or door that states every size out of the default type', () => {
    const raw = typedFlat() as Raw & { openings: Raw[]; types: Raw }
    raw.types['defaults'] = { window: 'W12', door: 'D80' }
    const wall = raw.openings[0]!['wall']
    const add = (extra: Raw): Raw => ({ offset: 0.2, wall, ...extra })
    raw.openings.push(
      add({ id: 'loft', type: 'window', width: 0.6, height: 0.6, sill: 1 }),
      add({ id: 'part', type: 'window', width: 0.6, height: 0.6 }),
      add({ id: 'named', type: 'window', width: 0.6, height: 0.6, sill: 1, windowType: 'W12' }),
      add({ id: 'plain-door', type: 'door', width: 0.7, height: 2 }),
    )
    const plan = parseFloorPlan(raw)
    const get = (id: string) => plan.openings.find((o) => o.id === id)!
    expect(get('loft').windowType).toBeUndefined()
    expect(get('loft').typed).toBeUndefined()
    expect(openingTypeOf(plan, get('loft'))).toBeNull()
    expect([get('part').windowType, get('part').sill, get('part').typed]).toEqual(['W12', 0.9, ['windowType', 'sill']])
    expect([get('named').windowType, get('named').width]).toEqual(['W12', 0.6])
    expect(get('plain-door').doorType).toBeUndefined()
  })

  it('reads a file\'s own typed as a field it does not know, and fills from no type it does not have', () => {
    const raw = typedFlat() as Raw & { walls: Raw[] }
    raw.walls[0]!['typed'] = ['thickness']
    const notes = readingNotes(raw)
    expect(notes.some((n) => n.kind === 'unknown-field' && n.field === 'typed')).toBe(true)
    expect(parseFloorPlan(raw).walls[0]!.typed).toBeUndefined()
  })

  it('reads a plan in millimetres with its types in millimetres too', () => {
    const raw = typedFlat() as Raw & { walls: Raw[]; types: { walls: Raw[] } }
    const mm = JSON.parse(JSON.stringify(raw)) as Raw & { walls: Raw[]; openings: Raw[]; types: { walls: Raw[]; doors: Raw[] } }
    mm['units'] = 'mm'
    for (const wall of mm.walls) {
      wall['start'] = (wall['start'] as number[]).map((v) => v * 1000)
      wall['end'] = (wall['end'] as number[]).map((v) => v * 1000)
      if (typeof wall['thickness'] === 'number') wall['thickness'] = (wall['thickness'] as number) * 1000
      wall['height'] = (wall['height'] as number) * 1000
    }
    for (const o of mm.openings) for (const key of ['offset', 'width', 'height', 'sill']) if (typeof o[key] === 'number') o[key] = (o[key] as number) * 1000
    mm.types.walls[0]!['thickness'] = 100
    mm.types.walls[0]!['height'] = 2600
    mm.types.doors[0]!['width'] = 800
    mm.types.doors[0]!['height'] = 2100
    const read = readPlanParts(mm)
    expect(read.plan).not.toBeNull()
    const wall = read.plan!.walls.find((w) => w.wallType === 'stud')!
    expect(wall.thickness).toBeCloseTo(0.1, 9)
    expect(read.plan!.openings.find((o) => o.doorType === 'D80')!.width).toBeCloseTo(0.8, 9)
  })

  it('reads a room\'s and a zone\'s finishes by surface', () => {
    const raw = typedFlat() as Raw & { rooms: Raw[] }
    raw.rooms[0]!['finishes'] = { floor: 'Oak boards', skirting: 'Oak skirting' }
    const plan = parseFloorPlan(raw)
    expect(roomFinishes(plan.rooms[0]!)).toEqual({ floor: 'Oak boards', walls: null, ceiling: null, skirting: 'Oak skirting' })
  })
})

describe('CNT-15 with CNT-6: a party wall type is a separating wall (lab AC-5)', () => {
  it('gives the walls of a separating type the kind CNT-6 reads, and the IFC types them apart from partitions', () => {
    const raw = typedFlat() as Raw & { walls: Raw[]; types: { walls: Raw[] } }
    raw.types.walls.push({ id: 'party', name: 'Party wall 250', thickness: 0.25, kind: 'separating', material: 'Concrete' })
    const party = raw.walls.find((w) => w['wallType'] === 'stud')!
    party['wallType'] = 'party'
    delete party['kind']
    const plan = parseFloorPlan(raw)
    const read = plan.walls.find((w) => w.id === party['id'])!
    expect([read.kind, read.thickness, read.typed]).toEqual(['separating', 0.25, ['thickness', 'kind']])
    const doc = parseStep(toIfc(plan))
    const type = ofType(doc, 'IFCWALLTYPE').find((t) => str(t.args[7]) === 'wall-type:party:0.25')!
    expect([str(type.args[2]), str(type.args[8])]).toEqual(['Party wall 250', 'Separating wall'])
    expect(ofType(doc, 'IFCMATERIAL').map((m) => str(m.args[0]))).toContain('Concrete')
  })
})

describe('CNT-15 the drawing\'s check names a type that is not there', () => {
  it('says a wall, a door and a default that name no type the plan has, with the type most likely meant', () => {
    const raw = typedFlat() as Raw & { walls: Raw[]; openings: Raw[]; types: Raw }
    raw.walls.find((w) => w['wallType'] === 'stud')!['wallType'] = 'studd'
    raw.walls.find((w) => w['wallType'] === 'stud')!['thickness'] = 0.1
    raw.openings.find((o) => o['type'] === 'window')!['windowType'] = 'W99'
    raw.openings.find((o) => o['type'] === 'window')!['doorType'] = 'D80'
    raw.types['defaults'] = { door: 'D90' }
    const issues = typeIssues(parseFloorPlan(raw))
    expect(issues.map((i) => [i.code, i.entity])).toEqual([
      ['type/unknown', 'wall'],
      ['type/wrong-part', 'opening'],
      ['type/unknown', 'opening'],
      ['type/unknown', 'plan'],
    ])
    expect(issues[0]!.message).toBe('Wall "' + raw.walls.find((w) => w['wallType'] === 'studd')!['id'] + '" names wall type "studd", which the plan\'s types do not hold, so it takes no type; "stud" is the type most likely meant')
    expect(validatePlan(parseFloorPlan(raw)).issues.filter((i) => i.code.startsWith('type/'))).toHaveLength(4)
  })

  it('says a type listed twice, and nothing on a plan with none', () => {
    const raw = typedFlat() as Raw & { types: { walls: Raw[] } }
    raw.types.walls.push({ id: 'stud', name: 'Another stud' })
    expect(typeIssues(parseFloorPlan(raw)).map((i) => i.code)).toEqual(['type/duplicate-id'])
    expect(typeIssues(flat())).toEqual([])
  })
})

describe('CNT-15 the IFC writes each type\'s material (lab AU3-4)', () => {
  it('names each wall type after the plan\'s, with its material, and "Not stated" where none is given', () => {
    const raw = typedFlat() as Raw & { walls: Raw[] }
    const glass = raw.walls.find((w) => w['wallType'] === 'stud')!
    glass['wallType'] = 'glass'
    const doc = parseStep(toIfc(parseFloorPlan(raw)))
    const types = ofType(doc, 'IFCWALLTYPE').map((t) => [str(t.args[2]), str(t.args[7]), str(t.args[8])])
    expect(types).toEqual(
      expect.arrayContaining([
        ['Stud partition 100', 'wall-type:stud:0.1', 'Interior wall'],
        ['Glass partition', 'wall-type:glass:0.05', 'Interior wall, glazed'],
        ['Exterior wall 0.2 m', 'wall:exterior:0.2', 'Exterior wall'],
      ])
    )
    const materials = ofType(doc, 'IFCMATERIAL').map((m) => str(m.args[0]))
    expect(materials.sort()).toEqual(['Laminated glass', 'Not stated', 'Oak', 'Plasterboard on timber studs'])
    // The doors of the named type carry its material; the IFC2x3 style is named after it.
    const style = ofType(doc, 'IFCDOORSTYLE').find((s) => str(s.args[7]) === 'door-type:D80')!
    expect(str(style.args[2]).startsWith('Internal door 800')).toBe(true)
    const rel = ofType(doc, 'IFCRELASSOCIATESMATERIAL').filter((r) => ofType(doc, 'IFCMATERIAL').some((m) => m.id === ref(r.args[5]) && str(m.args[0]) === 'Oak'))
    expect(rel).toHaveLength(1)
    expect(refs(rel[0]!.args[4]).length).toBeGreaterThan(0)
    expect(en(ofType(doc, 'IFCWALLTYPE')[0]!.args[9])).toBe('STANDARD')
  })

  it('writes "Not stated" for a type that states no material, and for walls of no type', () => {
    const raw = typedFlat() as Raw & { types: { walls: Raw[] } }
    delete raw.types.walls[0]!['material']
    const doc = parseStep(toIfc(parseFloorPlan(raw)))
    expect(ofType(doc, 'IFCMATERIAL').map((m) => str(m.args[0])).sort()).toEqual(['Not stated', 'Oak'])
  })
})
