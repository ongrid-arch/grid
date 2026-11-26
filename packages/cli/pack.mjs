// @ts-check
/**
 * Packs everything Grid is installed from, into one folder, and publishes nothing (CMD-9).
 *
 *   ongrid-<version>.tgz        the npm package: the bundled command, as `npm pack` makes it
 *   server.json                 the official MCP Registry's entry
 *   marketplace/                the plugin for Claude Code and Codex, and the marketplaces listing it
 *   install.md                  the Add to Cursor link and the set-up lines
 *   grid-<platform>-<arch>.mcpb the bundle for Claude's desktop app, with this computer's canvas
 *
 * Every one of them is made by `src/distribution/listing.ts`. Run `npm run build` first: this
 * packs the built `dist/grid.mjs`. Publishing the package, the registry entry and the plugin
 * waits on the owner's approval (CMD-8); until then the tarball installs from a path.
 *
 * Usage: node pack.mjs [--out <folder>]   (default: dist/release)
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const cli = dirname(fileURLToPath(import.meta.url))
const repo = resolve(cli, '../..')
const built = join(cli, 'dist', 'grid.mjs')

const argv = process.argv.slice(2)
let out = join(cli, 'dist', 'release')
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out' && argv[i + 1] !== undefined) out = resolve(argv[++i])
  else {
    process.stderr.write(`pack.mjs: unknown option ${JSON.stringify(argv[i])}. Usage: node pack.mjs [--out <folder>]\n`)
    process.exit(2)
  }
}
if (!existsSync(built)) {
  process.stderr.write('pack.mjs: the command is not built yet: run npm run build first.\n')
  process.exit(1)
}

const { version } = JSON.parse(readFileSync(join(cli, 'package.json'), 'utf8'))
const work = mkdtempSync(join(tmpdir(), 'grid-pack-'))

try {
  // The listing is TypeScript; bundle it once to run it here.
  const listingFile = join(work, 'listing.mjs')
  await build({
    stdin: {
      contents: "export * from './src/distribution/listing'\nexport { zip } from './src/distribution/zip'\nexport { GRID_TOOLS } from './src/mcp/serveTools'\nexport { agentGuide } from './src/guide/guide'\n",
      resolveDir: cli,
      loader: 'ts',
    },
    outfile: listingFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    external: ['@napi-rs/canvas'],
    loader: { '.md': 'text' },
    logLevel: 'warning',
  })
  /** @type {typeof import('./src/distribution/listing') & typeof import('./src/distribution/zip') & { GRID_TOOLS: import('./src/mcp/toolkit').GridTool[], agentGuide: () => string }} */
  const listing = await import(pathToFileURL(listingFile).href)

  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })

  /** @param {string} folder @param {Record<string, string>} files */
  const writeAll = (folder, files) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(folder, path)), { recursive: true })
      writeFileSync(join(folder, path), text)
    }
  }

  // The npm package: the built file and its chunks, the licence, and a manifest of its own.
  const stage = join(work, 'package')
  mkdirSync(stage)
  cpSync(built, join(stage, 'grid.mjs'))
  cpSync(join(cli, 'dist', 'chunks'), join(stage, 'chunks'), { recursive: true })
  cpSync(join(cli, 'dist', 'fonts'), join(stage, 'fonts'), { recursive: true })
  // CMD-7: the plan's JSON Schema, as the build wrote it, and the guide for agents.
  cpSync(join(cli, 'dist', 'plan.schema.json'), join(stage, 'plan.schema.json'))
  // CMD-40: the documentation pages, so the README's links read in the unpacked package.
  cpSync(join(repo, 'docs'), join(stage, 'docs'), { recursive: true })
  cpSync(join(repo, 'LICENSE'), join(stage, 'LICENSE'))
  cpSync(join(repo, 'NOTICE'), join(stage, 'NOTICE'))
  writeAll(stage, {
    'package.json': `${JSON.stringify(listing.packageManifest(version), null, 2)}\n`,
    'README.md': listing.packageReadme(),
    'guide.md': listing.agentGuide(),
  })
  const npm = process.env.npm_execpath && /npm-cli\.[cm]?js$/.test(process.env.npm_execpath)
    ? { command: process.execPath, args: [process.env.npm_execpath] }
    : { command: 'npm', args: [] }
  execFileSync(npm.command, [...npm.args, 'pack', stage, '--pack-destination', out, '--silent'], {
    stdio: ['ignore', 'ignore', 'inherit'],
    shell: process.platform === 'win32' && npm.command === 'npm',
  })

  writeAll(out, {
    'server.json': `${JSON.stringify(listing.serverJson(version), null, 2)}\n`,
    'install.md': `# Installing Grid\n\n${listing.installText()}`,
  })
  writeAll(join(out, 'marketplace'), listing.marketplaceFiles(version))

  // The bundle for Claude's desktop app: the server, its chunks, and this computer's canvas,
  // which is native, so a bundle is made per platform.
  /** @type {import('./src/distribution/zip').ZipEntry[]} */
  const entries = []
  /** @param {string} from @param {string} to */
  const addTree = (from, to) => {
    for (const name of readdirSync(from)) {
      const path = join(from, name)
      const inside = `${to}/${name}`
      const stat = statSync(path)
      if (stat.isDirectory()) addTree(path, inside)
      else entries.push({ path: inside, data: readFileSync(path), executable: (stat.mode & 0o111) !== 0 })
    }
  }
  entries.push({ path: 'server/grid.mjs', data: readFileSync(built), executable: true })
  addTree(join(cli, 'dist', 'chunks'), 'server/chunks')
  addTree(join(cli, 'dist', 'fonts'), 'server/fonts')
  entries.push({ path: 'LICENSE', data: readFileSync(join(repo, 'LICENSE')) }, { path: 'NOTICE', data: readFileSync(join(repo, 'NOTICE')) })
  const require = createRequire(join(cli, 'package.json'))
  let canvas = null
  try {
    canvas = dirname(require.resolve('@napi-rs/canvas/package.json'))
  } catch {
    process.stderr.write('pack.mjs: @napi-rs/canvas is not installed, so the bundle draws no pictures.\n')
  }
  if (canvas) {
    const scope = dirname(canvas)
    addTree(canvas, 'server/node_modules/@napi-rs/canvas')
    // Its binary for this computer, a package of its own beside it.
    for (const name of readdirSync(scope)) {
      if (name.startsWith(`canvas-${process.platform}-${process.arch}`)) addTree(join(scope, name), `server/node_modules/@napi-rs/${name}`)
    }
  }
  const manifest = listing.mcpbManifest(version, listing.mcpbTools(listing.GRID_TOOLS), process.platform)
  entries.push({ path: 'manifest.json', data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) })
  writeFileSync(join(out, `grid-${process.platform}-${process.arch}.mcpb`), listing.zip(entries))

  const shown = relative(process.cwd(), out).split(sep).join('/') || '.'
  process.stdout.write(`Packed Grid ${version} into ${shown}. Nothing was published.\n`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
