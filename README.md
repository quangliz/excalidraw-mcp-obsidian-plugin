# Excalidraw MCP

Let AI assistants create, edit, align, layout-check, and visually inspect your **Excalidraw** drawings right inside Obsidian via the Model Context Protocol (MCP).

> **Desktop only.** Requires the **Excalidraw** community plugin to be installed and enabled.

## What you can do

- **Draw and edit diagrams** — create or update shapes, text labels, frames, lines, arrows, and Mermaid diagrams directly on your open Excalidraw board.
- **Automatic layout checks** — every edit checks for overlapping shapes, text overflowing its container, arrows cutting across unrelated boxes, and disconnected arrows.
- **Visual verification** — export the whole board or specific elements as PNG/SVG so vision-capable AI assistants can inspect the rendered diagram, or save images straight into your vault for Markdown embeds.
- **Arrange and clean up** — align, evenly distribute, restack z-order, pan/zoom the viewport, and search elements by text, type, frame, or group.

## Quick start

1. Install and enable the **Excalidraw** community plugin in Obsidian.
2. Install and enable **Excalidraw MCP** from **Settings → Community plugins**.
3. Open any `.excalidraw.md` (or `.excalidraw`) drawing in Obsidian.
4. Connect your AI client:

### Using with Antidian (zero setup)

If you use **Antidian**, this plugin is detected automatically over local HTTP (`http://127.0.0.1:27129/mcp`).
Open **Settings → Antidian → MCP servers** to see **Excalidraw MCP** listed and toggle it on or off—no extra files or Node.js installation required.

### Using with any HTTP MCP client

Point your MCP client to the local Streamable HTTP endpoint:

```text
http://127.0.0.1:27129/mcp
```

If you set a **Bearer auth token** in **Settings → Excalidraw MCP**, include the header:

```text
Authorization: Bearer <your-token>
```

### Using with stdio MCP clients (Claude Desktop, Antigravity CLI, etc.)

If your client only supports `stdio` MCP servers, download `mcp-server.js` from the [GitHub Releases](https://github.com/quangliz/excalidraw-mcp-obsidian-plugin/releases) page (requires Node.js 18+) and add:

```json
{
  "mcpServers": {
    "excalidraw": {
      "command": "node",
      "args": ["/path/to/mcp-server.js"],
      "env": {
        "OBSIDIAN_EXCALIDRAW_MCP_PORT": "27129",
        "OBSIDIAN_EXCALIDRAW_MCP_TOKEN": "your-optional-bearer-token"
      }
    }
  }
}
```

## Available tools

| Category | Tools |
| :--- | :--- |
| **Inspect** | `get_scene_info`, `get_elements`, `search_elements`, `get_selected_elements`, `set_view` |
| **Draw & Edit** | `create_elements`, `update_elements`, `delete_elements`, `connect_elements`, `add_mermaid` |
| **Arrange** | `align_elements`, `restack_elements`, `clear_scene` |
| **Verify & Export** | `check_layout`, `export_image` (PNG image block or SVG, optional `saveToVaultPath`) |

## Settings & security

Open **Settings → Excalidraw MCP** to configure:

- **Bridge status** — start, stop, or restart the local server (also available via the status bar or Command Palette: `Toggle bridge`, `Restart bridge`).
- **Bridge port** — localhost port (default `27129`).
- **Bearer auth token** — optional shared secret for authenticating MCP requests.
- **Default target view** — target the active Excalidraw view or the first open view when `filePath` is omitted.
- **Auto-start bridge** — start automatically when Obsidian opens.

**Security notes:**

- The bridge binds strictly to `127.0.0.1` (local machine only, never exposed to your network).
- No arbitrary JavaScript evaluation endpoint is exposed.
- `clear_scene` requires explicit `confirm: true`, and `saveToVaultPath` only accepts safe vault-relative paths.

## Development

```bash
npm install
npm run typecheck
npm run build
npm test
node scripts/deploy-vault.mjs --vault /path/to/your/vault
```
