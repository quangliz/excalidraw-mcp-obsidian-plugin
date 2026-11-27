import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { BRIDGE_ACTIONS } from "../src/shared/protocol.ts";
import { HttpBridgeClient } from "../src/mcp/bridge-client.ts";
import { createMcpServer } from "../src/mcp/server.ts";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function createMockBridgeServer(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const rawBody = Buffer.concat(chunks).toString("utf8");
        const body = rawBody ? JSON.parse(rawBody) : undefined;
        await handler(req, res, body);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: false,
            error: {
              code: "INTERNAL_ERROR",
              message: err instanceof Error ? err.message : String(err),
            },
          }),
        );
      }
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to bind ephemeral port"));
        return;
      }
      resolve({
        port: addr.port,
        close: () =>
          new Promise((resClose, rejClose) => {
            server.close((err) => (err ? rejClose(err) : resClose()));
          }),
      });
    });
  });
}

async function getUnusedEphemeralPort() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

describe("MCP server tools and bridge client", () => {
  let mockServer;
  let mockPort;
  let capturedRequests = [];
  let customActionHandler = null;
  const expectedToken = "secret-test-token";

  before(async () => {
    mockServer = await createMockBridgeServer(async (req, res, body) => {
      if (req.headers.authorization !== `Bearer ${expectedToken}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: false,
            error: { code: "UNAUTHORIZED", message: "Invalid Bearer token" },
          }),
        );
        return;
      }

      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            status: "ready",
            port: mockPort,
            hasExcalidrawPlugin: true,
            hasActiveBoard: true,
          }),
        );
        return;
      }

      if (req.method === "POST" && req.url === "/rpc") {
        capturedRequests.push(body);
        if (customActionHandler) {
          const custom = await customActionHandler(body);
          if (custom) {
            res.writeHead(custom.status ?? 200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(custom.body));
            return;
          }
        }

        const { action, params, requestId } = body;
        if (action === "get_scene_info") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: true,
              requestId,
              data: {
                filePath: "Drawings/arch.excalidraw.md",
                title: "arch",
                elementCount: 2,
                bounds: { minX: 0, minY: 0, maxX: 400, maxY: 200, width: 400, height: 200 },
                typeCounts: { rectangle: 2 },
                frameIds: [],
              },
            }),
          );
          return;
        }

        if (action === "create_elements") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: true,
              requestId,
              data: {
                filePath: "Drawings/arch.excalidraw.md",
                createdIds: ["rect-1", "rect-2"],
                elements: [
                  { id: "rect-1", type: "rectangle", x: 0, y: 0, width: 120, height: 80 },
                  { id: "rect-2", type: "rectangle", x: 50, y: 20, width: 120, height: 80 },
                ],
                warnings: [
                  {
                    type: "shape_overlap",
                    severity: "warning",
                    elementIds: ["rect-1", "rect-2"],
                    message: 'Shapes "rect-1" and "rect-2" overlap (35% of smaller shape).',
                    hint: 'Reposition or resize "rect-1" or "rect-2" so they have clear separation.',
                  },
                ],
              },
            }),
          );
          return;
        }

        if (action === "clear_scene") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: true,
              requestId,
              data: {
                filePath: "Drawings/arch.excalidraw.md",
                clearedCount: 2,
              },
            }),
          );
          return;
        }

        if (action === "export_image") {
          if (params.format === "svg") {
            const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"></svg>';
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                ok: true,
                requestId,
                data: {
                  filePath: "Drawings/arch.excalidraw.md",
                  format: "svg",
                  mimeType: "image/svg+xml",
                  data: svg,
                  encoding: "utf8",
                  elementCount: 2,
                  savedToPath: params.saveToVaultPath ?? params.outputPath ?? null,
                },
              }),
            );
            return;
          }

          const pngBase64 = Buffer.from("fake-png-bytes").toString("base64");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: true,
              requestId,
              data: {
                filePath: "Drawings/arch.excalidraw.md",
                format: "png",
                mimeType: "image/png",
                base64: pngBase64,
                data: pngBase64,
                encoding: "base64",
                sizeBytes: Buffer.from("fake-png-bytes").byteLength,
                elementCount: 2,
                width: 400,
                height: 200,
                savedPath: params.saveToVaultPath ?? params.outputPath ?? null,
              },
            }),
          );
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, requestId, data: { filePath: "Drawings/arch.excalidraw.md" } }));
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "Not found" } }));
    });
    mockPort = mockServer.port;
  });

  after(async () => {
    await mockServer.close();
  });

  async function withConnectedClient(bridgeClient, fn) {
    const server = createMcpServer(bridgeClient);
    const client = new Client({ name: "test-client", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      return await fn(client);
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  }

  it("registers all BRIDGE_ACTIONS tools with valid JSON schemas", async () => {
    const bridge = new HttpBridgeClient({ port: mockPort, token: expectedToken });
    await withConnectedClient(bridge, async (client) => {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      const expected = [...BRIDGE_ACTIONS].sort();
      assert.deepEqual(names, expected);

      for (const tool of tools) {
        assert.equal(tool.inputSchema.type, "object");
        assert.ok(tool.description && tool.description.length > 0);
        assertNoTupleJsonSchema(tool.inputSchema, tool.name);
      }
    });
  });

  function assertNoTupleJsonSchema(node, path) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((item, idx) => assertNoTupleJsonSchema(item, `${path}[${idx}]`));
      return;
    }
    assert.equal(
      Array.isArray(node.items),
      false,
      `${path}: JSON Schema array-form 'items' (tuple) is incompatible with MCP clients`,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(node, "additionalItems"),
      false,
      `${path}: JSON Schema 'additionalItems' is incompatible with MCP clients`,
    );
    for (const [k, v] of Object.entries(node)) {
      assertNoTupleJsonSchema(v, `${path}.${k}`);
    }
  }

  it("executes get_scene_info over HTTP bridge with Bearer auth", async () => {
    capturedRequests = [];
    const bridge = new HttpBridgeClient({ port: mockPort, token: expectedToken });
    const health = await bridge.health();
    assert.equal(health.ok, true);
    assert.equal(health.hasActiveBoard, true);

    await withConnectedClient(bridge, async (client) => {
      const result = await client.callTool({ name: "get_scene_info", arguments: {} });
      assert.equal(result.isError, undefined);
      assert.equal(result.content.length, 1);
      assert.equal(result.content[0].type, "text");
      const parsed = JSON.parse(result.content[0].text);
      assert.equal(parsed.filePath, "Drawings/arch.excalidraw.md");
      assert.equal(parsed.elementCount, 2);
      assert.equal(capturedRequests[0].action, "get_scene_info");
    });
  });

  it("export_image returns native MCP image content block + metadata text block without raw base64", async () => {
    capturedRequests = [];
    const bridge = new HttpBridgeClient({ port: mockPort, token: expectedToken });
    const expectedBase64 = Buffer.from("fake-png-bytes").toString("base64");

    await withConnectedClient(bridge, async (client) => {
      const pngRes = await client.callTool({
        name: "export_image",
        arguments: {
          format: "png",
          saveToVaultPath: "Assets/arch.png",
        },
      });

      assert.equal(pngRes.isError, undefined);
      assert.equal(pngRes.content.length, 2);
      assert.equal(pngRes.content[0].type, "text");
      assert.equal(pngRes.content[1].type, "image");
      assert.equal(pngRes.content[1].mimeType, "image/png");
      assert.equal(pngRes.content[1].data, expectedBase64);

      const metadata = JSON.parse(pngRes.content[0].text);
      assert.equal(metadata.format, "png");
      assert.equal(metadata.mimeType, "image/png");
      assert.equal(metadata.sizeBytes, Buffer.from("fake-png-bytes").byteLength);
      assert.equal(metadata.elementCount, 2);
      assert.equal(metadata.savedPath, "Assets/arch.png");
      assert.equal("base64" in metadata, false);
      assert.equal(pngRes.content[0].text.includes(expectedBase64), false);

      const svgRes = await client.callTool({
        name: "export_image",
        arguments: {
          format: "svg",
          saveToVaultPath: "Assets/arch.svg",
        },
      });
      assert.equal(svgRes.isError, undefined);
      assert.equal(svgRes.content.length, 2);
      assert.equal(svgRes.content[0].type, "text");
      assert.equal(svgRes.content[1].type, "text");
      const svgMeta = JSON.parse(svgRes.content[0].text);
      assert.equal(svgMeta.format, "svg");
      assert.equal(svgMeta.mimeType, "image/svg+xml");
      assert.equal(svgMeta.savedPath, "Assets/arch.svg");
      assert.ok(svgRes.content[1].text.includes("<svg"));
    });
  });

  it("export_image rejects unsafe saveToVaultPath client-side before calling bridge", async () => {
    capturedRequests = [];
    const bridge = new HttpBridgeClient({ port: mockPort, token: expectedToken });

    await withConnectedClient(bridge, async (client) => {
      const res = await client.callTool({
        name: "export_image",
        arguments: {
          format: "png",
          saveToVaultPath: "../outside-vault.png",
        },
      });

      assert.equal(res.isError, true);
      assert.match(res.content[0].text, /Invalid vault-relative saveToVaultPath/);
      assert.equal(capturedRequests.length, 0);
    });
  });

  it("create_elements surfaces layoutWarnings", async () => {
    const bridge = new HttpBridgeClient({ port: mockPort, token: expectedToken });
    await withConnectedClient(bridge, async (client) => {
      const res = await client.callTool({
        name: "create_elements",
        arguments: {
          elements: [
            { type: "rectangle", x: 0, y: 0, width: 120, height: 80 },
            { type: "rectangle", x: 50, y: 20, width: 120, height: 80 },
          ],
        },
      });

      assert.equal(res.isError, undefined);
      const parsed = JSON.parse(res.content[0].text);
      assert.deepEqual(parsed.createdIds, ["rect-1", "rect-2"]);
      assert.equal(Array.isArray(parsed.layoutWarnings), true);
      assert.equal(parsed.layoutWarnings.length, 1);
      assert.equal(parsed.layoutWarnings[0].type, "shape_overlap");
    });
  });

  it("clear_scene rejects without confirm: true and succeeds when confirm: true", async () => {
    capturedRequests = [];
    const bridge = new HttpBridgeClient({ port: mockPort, token: expectedToken });
    await withConnectedClient(bridge, async (client) => {
      const missingConfirm = await client.callTool({
        name: "clear_scene",
        arguments: {},
      });
      assert.equal(missingConfirm.isError, true);
      assert.equal(capturedRequests.length, 0);

      const falseConfirm = await client.callTool({
        name: "clear_scene",
        arguments: { confirm: false },
      });
      assert.equal(falseConfirm.isError, true);
      assert.match(falseConfirm.content[0].text, /confirm/i);
      assert.equal(capturedRequests.length, 0);

      const trueConfirm = await client.callTool({
        name: "clear_scene",
        arguments: { confirm: true },
      });
      assert.equal(trueConfirm.isError, undefined);
      const parsed = JSON.parse(trueConfirm.content[0].text);
      assert.equal(parsed.clearedCount, 2);
      assert.equal(capturedRequests.length, 1);
    });
  });

  it("returns isError: true with actionable messages for offline, 401, and no-board-open errors", async () => {
    const closedPort = await getUnusedEphemeralPort();
    const offlineBridge = new HttpBridgeClient({ port: closedPort, token: expectedToken });

    await withConnectedClient(offlineBridge, async (client) => {
      const offlineRes = await client.callTool({ name: "get_scene_info", arguments: {} });
      assert.equal(offlineRes.isError, true);
      assert.match(offlineRes.content[0].text, /Cannot connect to Obsidian Excalidraw MCP bridge/);
      assert.match(offlineRes.content[0].text, new RegExp(String(closedPort)));
    });

    const badTokenBridge = new HttpBridgeClient({ port: mockPort, token: "wrong-token" });
    await withConnectedClient(badTokenBridge, async (client) => {
      const authRes = await client.callTool({ name: "get_scene_info", arguments: {} });
      assert.equal(authRes.isError, true);
      assert.match(authRes.content[0].text, /Unauthorized/i);
      assert.match(authRes.content[0].text, /OBSIDIAN_EXCALIDRAW_MCP_TOKEN/);
    });

    customActionHandler = async () => ({
      status: 400,
      body: {
        ok: false,
        error: {
          code: "NO_ACTIVE_VIEW",
          message: "No active Excalidraw view found.",
        },
      },
    });
    try {
      const okBridge = new HttpBridgeClient({ port: mockPort, token: expectedToken });
      await withConnectedClient(okBridge, async (client) => {
        const noBoardRes = await client.callTool({ name: "get_scene_info", arguments: {} });
        assert.equal(noBoardRes.isError, true);
        assert.match(noBoardRes.content[0].text, /Open an Excalidraw drawing/);
      });
    } finally {
      customActionHandler = null;
    }
  });

  it("communicates cleanly over StdioClientTransport with src/mcp/index.ts", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--experimental-strip-types", path.join(repoRoot, "src/mcp/index.ts")],
      env: {
        ...process.env,
        OBSIDIAN_EXCALIDRAW_MCP_PORT: String(mockPort),
        OBSIDIAN_EXCALIDRAW_MCP_TOKEN: expectedToken,
      },
      stderr: "pipe",
    });
    const client = new Client({ name: "stdio-test-client", version: "0.1.0" });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      assert.equal(tools.length, BRIDGE_ACTIONS.length);

      const sceneRes = await client.callTool({ name: "get_scene_info", arguments: {} });
      assert.equal(sceneRes.isError, undefined);
      const parsed = JSON.parse(sceneRes.content[0].text);
      assert.equal(parsed.filePath, "Drawings/arch.excalidraw.md");
    } finally {
      await client.close();
    }
  });

  it("scripts/deploy-vault.mjs --dry-run runs cleanly", async () => {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [
        path.join(repoRoot, "scripts/deploy-vault.mjs"),
        "--dry-run",
        "--vault",
        "/tmp/example-obsidian-vault",
      ],
      { cwd: repoRoot },
    );

    assert.equal(stderr, "");
    assert.match(stdout, /\[dry-run\] Target plugin directory: \/tmp\/example-obsidian-vault\/\.obsidian\/plugins\/excalidraw-mcp/);
    assert.match(stdout, /manifest\.json/);
    assert.match(stdout, /main\.js/);
  });
});
