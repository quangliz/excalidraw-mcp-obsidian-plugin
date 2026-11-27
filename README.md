# Obsidian Excalidraw MCP

Local HTTP bridge Obsidian plugin + standalone stdio MCP server bringing Excalidraw+ style diagramming, deterministic layout verification, and image export to Obsidian vaults.

## Architecture

- **Obsidian plugin (`dist/plugin/main.js`)**: Runs inside Obsidian Desktop, wraps `window.ExcalidrawAutomate` and `app.vault`, and exposes an authenticated `127.0.0.1` HTTP bridge (`GET /health`, `POST /rpc`).
- **MCP stdio server (`dist/mcp/server.js`)**: Standalone Node.js MCP server that translates MCP tool calls into bridge RPC calls and returns native MCP `image` content blocks for PNG exports.

## Build & Deploy to Obsidian Vault

```bash
npm install
npm run typecheck
npm run build
npm test
```

Preview or deploy the Obsidian plugin to your vault (defaults to `$OBSIDIAN_VAULT_PATH` or `/home/quangnv92/Documents/vsf`):

```bash
# Preview copy targets without modifying the vault
node scripts/deploy-vault.mjs --dry-run --vault /home/quangnv92/Documents/vsf

# Deploy manifest.json, styles.css, versions.json, and dist/plugin/main.js
node scripts/deploy-vault.mjs --vault /home/quangnv92/Documents/vsf
```

## Obsidian Plugin Activation

1. Install and enable the **Excalidraw** community plugin in Obsidian.
2. Open **Settings -> Community plugins**, reload plugins if needed, and enable **Obsidian Excalidraw MCP**.
3. Open **Settings -> Obsidian Excalidraw MCP** to inspect or configure:
   - **Port** (default `27129`)
   - **Auth Token** (optional Bearer token; recommended)
   - **Default View Target** (`active` or `first`)
   - **Auto-start bridge** (enabled by default)
4. Open an `.excalidraw.md` or `.excalidraw` note in Obsidian so there is an active board.

## MCP Client Configuration

Add the stdio server to your MCP client configuration (Antigravity, Claude Desktop, Antidian, etc.):

```json
{
  "mcpServers": {
    "obsidian-excalidraw": {
      "command": "node",
      "args": [
        "/home/quangnv92/Documents/obsidian-excalidraw-mcp/dist/mcp/server.js"
      ],
      "env": {
        "OBSIDIAN_EXCALIDRAW_MCP_PORT": "27129",
        "OBSIDIAN_EXCALIDRAW_MCP_TOKEN": "your-optional-bearer-token"
      }
    }
  }
}
```

## Tool Reference

| Category | Tool | Purpose |
| --- | --- | --- |
| Inspect | `get_scene_info` | Scene metadata, bounds, element type counts, frames, and `appState` |
| Inspect | `get_elements` | Fetch element snapshots (all or filtered by `ids`) |
| Inspect | `search_elements` | Search by text `query`, `types`, `frameId`, or `groupId` |
| Inspect | `get_selected_elements` | Get currently selected elements in the active Excalidraw view |
| Viewport | `set_view` | Pan/zoom to `targetElementIds`, `scrollToContent`, or coordinates |
| Mutate | `create_elements` | Create shapes, text, frames, lines, or arrows; returns `layoutWarnings` |
| Mutate | `update_elements` | Patch existing elements by `id`; returns `layoutWarnings` |
| Mutate | `delete_elements` | Delete elements by `id` (optionally with `deleteBoundElements`) |
| Mutate | `connect_elements` | Bind an arrow between `fromId` and `toId` with optional label and anchors |
| Mutate | `add_mermaid` | Convert Mermaid syntax into native Excalidraw elements |
| Mutate | `align_elements` | Align (`left`, `center`, `right`, `top`, `middle`, `bottom`) or distribute |
| Mutate | `restack_elements` | Adjust z-order (`front`, `back`, `forward`, `backward`) |
| Mutate | `clear_scene` | Clear all scene elements (requires `confirm: true`) |
| Verify | `check_layout` | Detect `text_overflow`, `shape_overlap`, `arrow_intersects_shape`, `disconnected_arrow` |
| Export | `export_image` | Export PNG (native MCP `image` + JSON metadata) or SVG, optionally saving to vault |

## Saving Exports for Antidian `read_note`

Pass `saveToVaultPath` to `export_image` to write the rendered image straight into your Obsidian vault through `app.vault`, updating Obsidian's index immediately so Antidian's `read_note` (or markdown embeds) can read it right away:

```json
{
  "format": "png",
  "scale": 2,
  "background": true,
  "saveToVaultPath": "Assets/diagrams/system-architecture.png"
}
```

You can then reference `![[Assets/diagrams/system-architecture.png]]` in a note or inspect it via Antidian `read_note`.
