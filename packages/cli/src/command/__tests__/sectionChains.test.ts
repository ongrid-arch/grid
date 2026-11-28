import { describe, expect, it } from 'vitest'
import { sectionAsked } from '../draw'

/** VEW-89: `grid draw --section` takes `--hide dimensions` to leave its dimension chains off, and nothing else to hide. */
describe('--hide with --section', () => {
  it('takes dimensions alone, to leave the chains off', () => {
    expect(sectionAsked({ png: false, section: '1,2:9,2', hide: 'dimensions' }).noChains).toBe(true)
    expect(sectionAsked({ png: false, section: '1,2:9,2' }).noChains).toBeUndefined()
  })

  it('refuses any other part to hide', () => {
    expect(() => sectionAsked({ png: false, section: '1,2:9,2', hide: 'title' })).toThrow('--hide is for a floor plan')
    expect(() => sectionAsked({ png: false, section: '1,2:9,2', hide: 'dimensions,title' })).toThrow('--hide is for a floor plan')
  })
})
