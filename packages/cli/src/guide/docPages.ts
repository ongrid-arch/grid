/**
 * CMD-40: the pages of `docs/` as resources of the tool server, so an agent that installed Grid
 * from npm reads them where it reads the tools. Each page is imported as text at build time
 * (esbuild's `.md` loader; `vitest.config.ts` does the same for tests) and sits in a chunk of its
 * own, loaded when a host reads it. The guide for agents is not here: it is `grid://guide`.
 *
 * Pure: it names pages and loads their text, and touches no file at run time.
 */
import type { ServerResource } from '../mcp/protocol'

/** The tool server's address of a page: `grid://docs/<page>`. */
export const DOCS_URI_PREFIX = 'grid://docs/'

interface DocPage {
  /** The page's heading, as its first line writes it. */
  readonly title: string
  /** When to read it, in a line. */
  readonly description: string
  readonly load: () => Promise<{ default: string }>
}

/** Every page but the guide, by file name without `.md`, in the order the resources list them. */
export const DOC_PAGES: Readonly<Record<string, DocPage>> = {
  recipes: {
    title: 'Recipes',
    description: 'Start from a task: a flat for a property listing, a house over three floors, a shop with zones, a plot with a building on it. Rooms text to start from and the calls that follow.',
    load: () => import('../../../../docs/recipes.md'),
  },
  'rooms-first': {
    title: 'Writing a plan rooms first',
    description: 'How to write a plan: rooms text names the rooms, doors and windows and Grid works out the walls. The whole grammar, floors, copies, repeats and the raw-wall form.',
    load: () => import('../../../../docs/rooms-first.md'),
  },
  commands: {
    title: 'Commands',
    description: 'Each command of grid and ongrid, its options and exit codes, and the project folder it reads and writes.',
    load: () => import('../../../../docs/commands.md'),
  },
  'tool-server': {
    title: 'The tool server',
    description: 'The grid_ tools, what each answers, the size of an answer, camera and views, the preview, protocol versions and the resources.',
    load: () => import('../../../../docs/tool-server.md'),
  },
  'plan-file': {
    title: 'The plan file',
    description: 'What a plan file may hold: floors, stairs, ramps, site, facts, finishes, phases, zones and the rest, and what each drawing check\'s code means.',
    load: () => import('../../../../docs/plan-file.md'),
  },
  conventions: {
    title: 'The plan file\'s conventions',
    description: 'Where a wall\'s line runs, where an opening sits, how a room names its walls, which way the axes run and how floors stack.',
    load: () => import('../../../../docs/conventions.md'),
  },
  brief: {
    title: 'The brief',
    description: 'What the person asked for, kept beside the plan, and what a line met or missed means after an edit.',
    load: () => import('../../../../docs/brief.md'),
  },
  'firm-standards': {
    title: 'A firm\'s own standards',
    description: 'A firm\'s own figures, such as corridors at least 1.5 m, set against its plans, and what a firm/ note in a check means.',
    load: () => import('../../../../docs/firm-standards.md'),
  },
  library: {
    title: 'The library: fixtures, furniture and typical rooms by name',
    description: 'Placing a fixture, furniture or a typical room by name, an office\'s own library, and adding a kind of thing.',
    load: () => import('../../../../docs/library.md'),
  },
  areas: {
    title: 'Measuring areas',
    description: 'What an area figure measures: net, gross internal and gross external, which comes first where, the schedules and the quantities for a first estimate.',
    load: () => import('../../../../docs/areas.md'),
  },
  tolerances: {
    title: 'Tolerances and limits',
    description: 'The exact figure behind each drawing check, and when Grid asks whether a size is meant.',
    load: () => import('../../../../docs/tolerances.md'),
  },
  '3d-files': {
    title: '3D files: GLB and OBJ',
    description: 'Before opening a GLB or OBJ from Grid elsewhere: which way is up, the units, what each node and object is called, the materials, normals and UVs, and how to make the file lighter.',
    load: () => import('../../../../docs/3d-files.md'),
  },
  'result-contract': {
    title: 'The result contract',
    description: 'What grid_check and grid check return: the record, refusals, receipts and every message code.',
    load: () => import('../../../../docs/result-contract.md'),
  },
  languages: {
    title: 'Languages',
    description: 'How Grid writes in a language: the message files, the language option, and room uses by language.',
    load: () => import('../../../../docs/languages.md'),
  },
}

export function docResources(): ServerResource[] {
  return Object.entries(DOC_PAGES).map(([page, { title, description, load }]) => ({
    definition: { uri: `${DOCS_URI_PREFIX}${page}`, name: `grid-docs-${page}`, title, description, mimeType: 'text/markdown' },
    read: async () => ({ text: (await load()).default }),
  }))
}
