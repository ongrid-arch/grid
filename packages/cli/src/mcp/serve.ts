/**
 * Grid's tool server loop: JSON-RPC lines on standard input, answers on standard output.
 *
 * The loop itself imports only Node's stdlib and the pure protocol, and opens no sockets and
 * talks to no other process. The tools are handed in (`serveTools.ts`), and reach the disk only
 * through the project's resolver. `server.ts` starts it on its own; `grid serve` starts it from
 * the command's file.
 *
 * Answers go out in the order the requests came in, even when a picture takes a while.
 */
import { createInterface } from 'readline'
import { handleLine, type ServerResource, type ServerTool } from './protocol'

export function startToolServer(tools: readonly ServerTool[] = [], resources: readonly ServerResource[] = []): void {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
  let queue: Promise<void> = Promise.resolve()

  lines.on('line', (line) => {
    // SHT-25: a progress line goes out at once, while the call it is about is still worked out.
    const out = handleLine(line, tools, resources, (note) => process.stdout.write(`${note}\n`))
    queue = queue.then(async () => {
      const answer = await out
      if (answer !== null) process.stdout.write(`${answer}\n`)
    })
  })

  // No exit call: when the host closes stdin the loop has nothing left and the process
  // ends on its own, after any answer still being worked out or written.
}
