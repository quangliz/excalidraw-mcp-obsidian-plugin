import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBridgeClientFromEnv } from "./bridge-client.ts";
import { createMcpServer } from "./server.ts";

async function main(): Promise<void> {
  const bridgeClient = createBridgeClientFromEnv();
  const server = createMcpServer(bridgeClient);
  const transport = new StdioServerTransport();

  const shutdown = async () => {
    try {
      await server.close();
    } catch {
      // Ignore close errors during shutdown
    }
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  await server.connect(transport);
}

main().catch((err) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`[obsidian-excalidraw-mcp] Fatal startup error: ${message}\n`);
  process.exit(1);
});
