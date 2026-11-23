/**
 * VEW-4: the names the preview page and the tool server share, apart from the page itself, which
 * is loaded only when a host or `grid preview` asks for it.
 */

/** The name of the page's own tool, which the server lists for the page only (visibility `app`). */
export const PREVIEW_SYNC_TOOL = 'grid_preview_sync'
/** The MCP App resource the page is served as. */
export const PREVIEW_RESOURCE_URI = 'ui://grid/preview'
/** The MCP Apps standard's type for an HTML page. */
export const PREVIEW_RESOURCE_MIME = 'text/html;profile=mcp-app'

/** AIV-19: the hosted server's page, an MCP App that draws the plan a tool call carried. */
export const HOSTED_RESOURCE_URI = 'ui://grid/plan'
/** The key of a hosted result's `_meta` that holds the drawings, one per floor, for that page alone. */
export const HOSTED_DRAWINGS_KEY = 'grid/drawings'
