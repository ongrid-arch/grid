import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { openProject } from '../../fs/projectFiles'
import { loadPlan, PlanRefused } from '../plan'
import { foreignFileKind } from '../planFile'

/**
 * CMD-20: a CAD file, a PDF or a picture handed over as a plan is named for what it is, by its
 * first bytes, and the refusal says what Grid does with it instead of a JSON or UTF-8 fault.
 */

const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0x80, 0xfe, 0xff])])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x80, 0x90])
const PDF = Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n', 'latin1')
const DWG = Buffer.concat([Buffer.from('AC1032'), Buffer.from([0, 0, 0, 0, 0, 0xff, 0x80])])
const IFC = Buffer.from("ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition'),'2;1');\n")
const DXF = Buffer.from('  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1027\n')
const DXF_COMMENTED = Buffer.from('999\ndrawn by a person\n0\r\nSECTION\r\n2\r\nENTITIES\r\n')

function refusal(bytes: Buffer | string, name = 'plan.json'): string {
  const dir = mkdtempSync(join(tmpdir(), 'grid-foreign-'))
  made.push(dir)
  writeFileSync(join(dir, name), bytes)
  try {
    loadPlan(openProject(dir, dir), name)
  } catch (error) {
    expect(error).toBeInstanceOf(PlanRefused)
    return (error as Error).message
  }
  throw new Error('the file was read as a plan')
}

describe('a file that is not a plan is named by its first bytes', () => {
  const cases: ReadonlyArray<readonly [string, Buffer, string, RegExp]> = [
    ['dxf', DXF, 'DXF drawing', /does not read DXF yet.*grid write/],
    ['dxf with comments', DXF_COMMENTED, 'DXF drawing', /does not read DXF yet/],
    ['dwg', DWG, 'DWG drawing', /does not read DWG yet/],
    ['ifc', IFC, 'IFC model', /does not read IFC yet/],
    ['pdf', PDF, 'PDF', /does not read PDF yet/],
    ['png', PNG, 'PNG picture', /referenceImage.*grid write/],
    ['jpeg', JPEG, 'JPEG picture', /referenceImage.*grid write/],
  ]
  for (const [label, bytes, name, rest] of cases) {
    it(`${label}, even saved as plan.json`, () => {
      const said = refusal(bytes)
      expect(said).toContain(`plan.json is a ${name}`.replace('is a IFC', 'is an IFC'))
      expect(said).toMatch(rest)
      expect(said).not.toMatch(/not JSON|UTF-8|unknown/i)
    })
  }

  it('is told by the bytes, not by the name', () => {
    expect(refusal(PDF, 'floor.dxf')).toContain('is a PDF')
  })
})

describe('what is not mistaken for one', () => {
  it('knows none of a plan, a byte-order mark, a text that starts with 0 or an empty file', () => {
    for (const text of ['{"walls":[]}', '﻿{"walls":[]}', '0\nnot a section\n', '', 'SECTION\n0\n', '%PDF']) {
      expect(foreignFileKind(Buffer.from(text))).toBeNull()
    }
  })

  it('still reads a plan with a byte-order mark', () => {
    const dir = mkdtempSync(join(tmpdir(), 'grid-foreign-'))
    made.push(dir)
    writeFileSync(join(dir, 'plan.json'), '﻿{"version":"1","units":"m","walls":[],"rooms":[],"openings":[]}')
    expect(loadPlan(openProject(dir, dir), 'plan.json').plan.walls).toEqual([])
  })
})
