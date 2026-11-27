import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BridgeClient } from "./bridge-client.ts";
import { registerAllTools } from "./tools.ts";

export function createMcpServer(bridgeClient: BridgeClient): McpServer {
  const server = new McpServer({
    name: "obsidian-excalidraw-mcp",
    version: "0.1.0",
  });

  registerAllTools(server, bridgeClient);
  return server;
}
