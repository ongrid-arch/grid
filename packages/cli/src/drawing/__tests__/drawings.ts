/**
 * CMD-43: invented drawings for the readers' tests, written here and never copied from a real
 * survey: a small DXF writer and a hand-written IFC file.
 */

type Pt = readonly [number, number]

/** A DXF entity, as the writer takes it. */
export type DxfEntity =
  | { readonly type: 'LINE'; readonly layer: string; readonly a: Pt; readonly b: Pt }
  | { readonly type: 'LWPOLYLINE'; readonly layer: string; readonly points: readonly Pt[]; readonly bulges?: readonly number[]; readonly closed?: boolean }
  | { readonly type: 'ARC'; readonly layer: string; readonly c: Pt; readonly r: number; readonly from: number; readonly to: number }
  | { readonly type: 'TEXT'; readonly layer: string; readonly at: Pt; readonly text: string; readonly height?: number }
  | { readonly type: 'MTEXT'; readonly layer: string; readonly at: Pt; readonly text: string; readonly height?: number }
  | { readonly type: 'INSERT'; readonly layer: string; readonly block: string; readonly at: Pt; readonly rotation?: number; readonly attribs?: readonly { tag: string; value: string }[] }

export interface DxfBlock {
  readonly name: string
  readonly entities: readonly DxfEntity[]
}

/** An ASCII DXF of the entities and blocks given, with `$INSUNITS` when a unit is given. */
export function dxfText(entities: readonly DxfEntity[], options: { readonly insunits?: number; readonly blocks?: readonly DxfBlock[] } = {}): string {
  let handle = 0x100
  const out: (string | number)[] = []
  const pair = (code: number, value: string | number): void => {
    out.push(code, value)
  }
  const entity = (e: DxfEntity): void => {
    pair(0, e.type)
    pair(5, (handle++).toString(16).toUpperCase())
    pair(8, e.layer)
    switch (e.type) {
      case 'LINE':
        pair(10, e.a[0]); pair(20, e.a[1]); pair(30, 0)
        pair(11, e.b[0]); pair(21, e.b[1]); pair(31, 0)
        break
      case 'LWPOLYLINE':
        pair(90, e.points.length)
        pair(70, e.closed === true ? 1 : 0)
        e.points.forEach((p, i) => {
          pair(10, p[0]); pair(20, p[1])
          if ((e.bulges?.[i] ?? 0) !== 0) pair(42, e.bulges![i]!)
        })
        break
      case 'ARC':
        pair(10, e.c[0]); pair(20, e.c[1]); pair(30, 0); pair(40, e.r); pair(50, e.from); pair(51, e.to)
        break
      case 'TEXT':
        pair(10, e.at[0]); pair(20, e.at[1]); pair(30, 0); pair(40, e.height ?? 200); pair(1, e.text)
        break
      case 'MTEXT':
        pair(10, e.at[0]); pair(20, e.at[1]); pair(30, 0); pair(40, e.height ?? 200); pair(1, e.text)
        break
      case 'INSERT':
        if (e.attribs !== undefined) pair(66, 1)
        pair(2, e.block); pair(10, e.at[0]); pair(20, e.at[1]); pair(30, 0)
        if (e.rotation !== undefined) pair(50, e.rotation)
        if (e.attribs !== undefined) {
          for (const a of e.attribs) {
            pair(0, 'ATTRIB'); pair(5, (handle++).toString(16).toUpperCase()); pair(8, e.layer)
            pair(10, e.at[0]); pair(20, e.at[1]); pair(30, 0); pair(40, 150); pair(1, a.value); pair(2, a.tag)
          }
          pair(0, 'SEQEND')
        }
        break
    }
  }
  pair(0, 'SECTION'); pair(2, 'HEADER')
  pair(9, '$ACADVER'); pair(1, 'AC1027')
  if (options.insunits !== undefined) { pair(9, '$INSUNITS'); pair(70, options.insunits) }
  pair(0, 'ENDSEC')
  pair(0, 'SECTION'); pair(2, 'BLOCKS')
  for (const b of options.blocks ?? []) {
    pair(0, 'BLOCK'); pair(8, '0'); pair(2, b.name); pair(70, 0); pair(10, 0); pair(20, 0); pair(30, 0)
    for (const e of b.entities) entity(e)
    pair(0, 'ENDBLK')
  }
  pair(0, 'ENDSEC')
  pair(0, 'SECTION'); pair(2, 'ENTITIES')
  for (const e of entities) entity(e)
  pair(0, 'ENDSEC')
  pair(0, 'EOF')
  return out.map(String).join('\n') + '\n'
}

const L = (a: Pt, b: Pt, layer = 'A-WALL'): DxfEntity => ({ type: 'LINE', layer, a, b })

/** A door block: its leaf and swing, 900 wide, along +x from its insertion point. */
export const DOOR_BLOCK: DxfBlock = { name: 'DOOR-900', entities: [L([0, 0], [0, 900], '0'), { type: 'ARC', layer: '0', c: [0, 0], r: 900, from: 0, to: 90 }] }
/** A window block: the glass and the two faces across a 300 wall, 1800 wide. */
export const WINDOW_BLOCK: DxfBlock = { name: 'WIN-1800', entities: [L([0, 150], [1800, 150], '0'), L([0, -150], [1800, -150], '0'), L([0, 0], [1800, 0], '0')] }

/**
 * A flat of three rooms drawn as a survey is, in millimetres: each face of each wall a line on
 * `A-WALL`, broken where a door or window is. Outside 300 thick, 9300 by 4600 outside; a living
 * room 4000 by 4000 (a window south, 1800, and a door east into the kitchen, 900), a kitchen
 * 2500 by 4000 (the front door south, 900, and a doorless gap east into the bath, 800) and a bath
 * 2000 by 4000. Names as TEXT and MTEXT on `A-ROOM-IDEN`, with the living room's stated area.
 */
export function surveyFlat(options: { readonly layer?: string; readonly insunits?: number | null } = {}): string {
  const w = options.layer ?? 'A-WALL'
  const l = (a: Pt, b: Pt): DxfEntity => L(a, b, w)
  const faces: DxfEntity[] = [
    // The outside face, broken for the window (1000-2800) and the front door (5000-5900).
    l([0, 0], [1000, 0]), l([2800, 0], [5000, 0]), l([5900, 0], [9300, 0]), l([9300, 0], [9300, 4600]), l([9300, 4600], [0, 4600]), l([0, 4600], [0, 0]),
    // The jambs of the window and the front door.
    l([1000, 0], [1000, 300]), l([2800, 0], [2800, 300]), l([5000, 0], [5000, 300]), l([5900, 0], [5900, 300]),
    // Living room.
    l([300, 300], [1000, 300]), l([2800, 300], [4300, 300]), l([4300, 300], [4300, 1000]), l([4300, 1900], [4300, 4300]), l([4300, 4300], [300, 4300]), l([300, 4300], [300, 300]),
    // The door's jambs in the partition (one drawn, one not).
    l([4300, 1000], [4400, 1000]),
    // Kitchen.
    l([4400, 300], [5000, 300]), l([5900, 300], [6900, 300]), l([4400, 300], [4400, 1000]), l([4400, 1900], [4400, 4300]), l([4400, 4300], [6900, 4300]), l([6900, 300], [6900, 2000]), l([6900, 2800], [6900, 4300]),
    // Bath.
    l([7000, 300], [9000, 300]), l([9000, 300], [9000, 4300]), l([9000, 4300], [7000, 4300]), l([7000, 4300], [7000, 2800]), l([7000, 2000], [7000, 300]),
  ]
  const rest: DxfEntity[] = [
    { type: 'INSERT', layer: 'A-WIND', block: WINDOW_BLOCK.name, at: [1000, 150] },
    { type: 'INSERT', layer: 'A-DOOR', block: DOOR_BLOCK.name, at: [5000, 150] },
    { type: 'INSERT', layer: 'A-DOOR', block: DOOR_BLOCK.name, at: [4350, 1000], rotation: 90 },
    { type: 'TEXT', layer: 'A-ROOM-IDEN', at: [1500, 2500], text: 'Living room', height: 250 },
    { type: 'TEXT', layer: 'A-ROOM-IDEN', at: [1500, 2100], text: '16.00 m²', height: 150 },
    { type: 'MTEXT', layer: 'A-ROOM-IDEN', at: [5000, 2500], text: 'Kitchen\\P10.00 m2' },
    { type: 'TEXT', layer: 'A-ROOM-IDEN', at: [7500, 2500], text: 'Bath' },
  ]
  return dxfText([...faces, ...rest], { ...(options.insunits === null ? {} : { insunits: options.insunits ?? 4 }), blocks: [DOOR_BLOCK, WINDOW_BLOCK] })
}

/**
 * A two-storey building as a hand-written IFC4 file, in millimetres: on each storey a hall and an
 * office as spaces (rectangle profiles), the walls round them (outside 300, the one between 100),
 * a door between the two and, on the upper storey, a window south in the office. The upper
 * storey stands at 3000.
 */
export function smallIfc(): string {
  let n = 100
  const lines: string[] = []
  const add = (body: string): number => {
    lines.push(`#${++n}=${body};`)
    return n
  }
  const pt = (x: number, y: number, z = 0): number => add(`IFCCARTESIANPOINT((${x}.,${y}.,${z}.))`)
  const pt2 = (x: number, y: number): number => add(`IFCCARTESIANPOINT((${x}.,${y}.))`)
  const axes = (x: number, y: number, z = 0, dir?: readonly [number, number]): number => add(`IFCAXIS2PLACEMENT3D(#${pt(x, y, z)},$,${dir === undefined ? '$' : `#${add(`IFCDIRECTION((${dir[0]}.,${dir[1]}.,0.))`)}`})`)
  const place = (rel: number | null, x: number, y: number, z = 0, dir?: readonly [number, number]): number => add(`IFCLOCALPLACEMENT(${rel === null ? '$' : `#${rel}`},#${axes(x, y, z, dir)})`)
  const up = add('IFCDIRECTION((0.,0.,1.))')
  const box = (w: number, d: number, h: number): number => {
    const profile = add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${add(`IFCAXIS2PLACEMENT2D(#${pt2(w / 2, d / 2)},$)`)},${w}.,${d}.)`)
    const solid = add(`IFCEXTRUDEDAREASOLID(#${profile},#${axes(0, 0)},#${up},${h}.)`)
    return add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${add(`IFCSHAPEREPRESENTATION(#${ctx},'Body','SweptSolid',(#${solid}))`)}))`)
  }
  const ctx = add("IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#" + (n + 2) + ',$)')
  axes(0, 0)
  const unit = add('IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)')
  add(`IFCUNITASSIGNMENT((#${unit}))`)
  const project = add(`IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'Invented office',$,$,$,$,(#${ctx}),#${n})`)
  const site = add(`IFCSITE('3BoQ5Ix5L1AhQvA7NBWlbu',$,'Site',$,$,#${place(null, 0, 0)},$,$,.ELEMENT.,$,$,$,$,$)`)
  const building = add(`IFCBUILDING('1kTvXnbbzCWw8lcMd1dR4o',$,'Building',$,$,#${place(null, 0, 0)},$,$,.ELEMENT.,$,$,$)`)
  add(`IFCRELAGGREGATES('2b3mI7O7fCYgFOkDbA9xs4',$,$,$,#${project},(#${site}))`)
  add(`IFCRELAGGREGATES('1jFtiZ9Ln0ugm2UkLvbJPb',$,$,$,#${site},(#${building}))`)
  const storeys: number[] = []
  const names = ['Ground floor', 'First floor']
  let guid = 0
  const g = (): string => `0${String(guid++).padStart(3, '0')}Invented$Guid_${'abcdef'[guid % 6]}0000`.slice(0, 22)
  for (const [k, elevation] of [0, 3000].entries()) {
    const sp = place(null, 0, 0, elevation)
    const storey = add(`IFCBUILDINGSTOREY('${g()}',$,'${names[k]}',$,$,#${sp},$,$,.ELEMENT.,${elevation}.)`)
    storeys.push(storey)
    const parts: number[] = []
    // Spaces: hall 0-3000 x 0-4000, office 3100-7000 x 0-4000.
    const hall = add(`IFCSPACE('${g()}',$,'G${k}.01',$,$,#${place(sp, 0, 0)},#${box(3000, 4000, 2700)},'Hall',.ELEMENT.,.INTERNAL.,$)`)
    const office = add(`IFCSPACE('${g()}',$,'G${k}.02',$,$,#${place(sp, 3100, 0)},#${box(3900, 4000, 2700)},'Office',.ELEMENT.,.INTERNAL.,$)`)
    add(`IFCRELAGGREGATES('${g()}',$,$,$,#${storey},(#${hall},#${office}))`)
    // Walls: outside 300 round 0-7000 x 0-4000, and the one between at 3000-3100.
    const wall = (x: number, y: number, w: number, d: number): number => {
      const id = add(`IFCWALL('${g()}',$,'Wall',$,$,#${place(sp, x, y)},#${box(w, d, 2700)},$,$)`)
      parts.push(id)
      return id
    }
    const south = wall(-300, -300, 7600, 300)
    wall(-300, 4000, 7600, 300)
    wall(-300, 0, 300, 4000)
    wall(7000, 0, 300, 4000)
    const between = wall(3000, 0, 100, 4000)
    // A door in the wall between, 900 wide from y 1000, its placement at its start jamb along +y.
    const hole = add(`IFCOPENINGELEMENT('${g()}',$,'Hole',$,$,#${place(sp, 3050, 1000, 0, [0, 1])},$,$,.OPENING.)`)
    add(`IFCRELVOIDSELEMENT('${g()}',$,$,$,#${between},#${hole})`)
    const door = add(`IFCDOOR('${g()}',$,'Door',$,$,#${place(sp, 3050, 1000, 0, [0, 1])},$,$,2100.,900.,.DOOR.,$,$)`)
    add(`IFCRELFILLSELEMENT('${g()}',$,$,$,#${hole},#${door})`)
    parts.push(door)
    if (k === 1) {
      const wh = add(`IFCOPENINGELEMENT('${g()}',$,'Hole',$,$,#${place(sp, 4500, -150, 900)},$,$,.OPENING.)`)
      add(`IFCRELVOIDSELEMENT('${g()}',$,$,$,#${south},#${wh})`)
      const window = add(`IFCWINDOW('${g()}',$,'Window',$,$,#${place(sp, 4500, -150, 900)},$,$,1200.,1500.,.WINDOW.,$,$)`)
      add(`IFCRELFILLSELEMENT('${g()}',$,$,$,#${wh},#${window})`)
      parts.push(window)
    }
    add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${g()}',$,$,$,(${parts.map((p) => `#${p}`).join(',')}),#${storey})`)
  }
  add(`IFCRELAGGREGATES('${g()}',$,$,$,#${building},(${storeys.map((s) => `#${s}`).join(',')}))`)
  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');",
    "FILE_NAME('invented.ifc','2026-01-01T00:00:00',(''),(''),'','','');",
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    ...lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n')
}
