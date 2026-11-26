/**
 * CMD-7 (T-app-integrator-9, T-estate-agent-listings-22): the guide for agents and the plan's JSON
 * Schema, as resources of the tool server, so an agent with no copy of the repository reads them
 * where it reads Grid's tools. Each is made when it is read, from the same code as the page and
 * the built `plan.schema.json`.
 */
import { planJsonSchema } from '@ongrid/floorplan/types/planSchema'
import type { ServerResource } from '../mcp/protocol'
import { docResources } from './docPages'
import { agentGuide, GUIDE_URI, SCHEMA_URI } from './guide'

export function guideResources(): ServerResource[] {
  return [
    {
      definition: {
        uri: GUIDE_URI,
        name: 'grid-guide',
        title: 'Guide for agents',
        description: 'How to write a plan: rooms first, the raw-wall form, and the answers to what agents ask before a first plan. Read it before writing one.',
        mimeType: 'text/markdown',
      },
      read: async () => ({ text: agentGuide() }),
    },
    {
      definition: {
        uri: SCHEMA_URI,
        name: 'grid-plan-schema',
        title: 'Plan file JSON Schema',
        description: 'The plan file\'s structure as a draft-07 JSON Schema, with its format version, made from the code Grid reads plans with.',
        mimeType: 'application/schema+json',
      },
      read: async () => ({ text: `${JSON.stringify(planJsonSchema(), null, 2)}\n` }),
    },
    // CMD-40: the pages of docs/, each as markdown.
    ...docResources(),
  ]
}
