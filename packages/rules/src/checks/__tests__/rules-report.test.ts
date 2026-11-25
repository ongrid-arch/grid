import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { checkLocalRules } from '..'
import { edit, flat, twoFloorHouse, withoutOpening } from '@ongrid/floorplan/test-support/plans'

/** A deterministic shuffle (mulberry32), so a failure can be replayed. */
function shuffled(plan: FloorPlan, seed: number): FloorPlan {
  let state = seed
  const random = (): number => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const mix = <T>(items: T[]): T[] => {
    const copy = [...items]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
    }
    return copy
  }
  return edit(plan, (copy) => {
    copy.walls = mix(copy.walls)
    copy.rooms = mix(copy.rooms)
    copy.openings = mix(copy.openings)
    if (copy.floors) copy.floors = mix(copy.floors)
  })
}

describe('the report', () => {
  const plans: [string, FloorPlan][] = [
    ['the flat', withoutOpening(flat(), 'd_hb')],
    ['the two-floor house', withoutOpening(twoFloorHouse(), 'd_up')]
  ]

  it.each(plans)('is byte-identical for %s with its entities in any order', (_name, plan) => {
    const reference = JSON.stringify(checkLocalRules(plan))
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(JSON.stringify(checkLocalRules(shuffled(plan, seed)))).toBe(reference)
    }
  })

  it('lists findings by storey, then code', () => {
    const plan = withoutOpening(withoutOpening(twoFloorHouse(), 'd_up'), 'd_hb')
    const findings = checkLocalRules(plan).findings
    // LVL-1: the second finding upstairs is the balcony door, 2.95 m up (lab VE-8).
    // LVL-14: the third upstairs is the floor itself, which no stair reaches.
    expect(findings.map((f) => f.floor)).toEqual(['ground', 'ground', 'first', 'first', 'first'])
  })
})

describe('the checks and the notes', () => {
  const dirs = [join(__dirname, '..'), join(__dirname, '..', '..', 'notes')]
  const FORBIDDEN = /from '(react|react-dom|three|@react-three\/[^']+|node:[^']+)'|\b(window|document)\./

  /** Relative imports, and the core by its package name: nothing else. */
  const offending = (source: string): boolean =>
    FORBIDDEN.test(source) ||
    [...source.matchAll(/from '([^']+)'/g)].some(
      ([, path]) => !path!.startsWith('./') && !path!.startsWith('../') && !path!.startsWith('@ongrid/floorplan/')
    )

  it('import only from this package and the core', () => {
    const files = dirs.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => join(dir, f)))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) expect(offending(readFileSync(file, 'utf8')), file).toBe(false)
  })

  it.each([
    "import { useState } from 'react'",
    "import * as THREE from 'three'",
    "import { readFileSync } from 'node:fs'",
    "import { join } from 'path'",
    'const width = window.innerWidth'
  ])('would catch %s', (line) => {
    const source = readFileSync(join(dirs[0]!, 'check.ts'), 'utf8')
    expect(offending(`${line}\n${source}`)).toBe(true)
  })
})
