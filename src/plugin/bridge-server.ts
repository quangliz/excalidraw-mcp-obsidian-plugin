import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  BRIDGE_ACTIONS,
  DEFAULT_BRIDGE_HOST,
  type BridgeAction,
  type BridgeRequest,
  type BridgeResponse,
} from "../shared/protocol.ts";
import { EaAdapterError, type EaAdapter } from "./ea-adapter.ts";
import { BridgeActionError, type BridgeHandlerMap } from "./handlers.ts";
import { handleMcpJsonRpc } from "./mcp-http.ts";

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2MB
const ACTION_SET = new Set<string>(BRIDGE_ACTIONS);

export interface BridgeServerOptions {
  port: number;
  getAuthToken?: () => string;
  handlers: BridgeHandlerMap;
  adapter: Pick<EaAdapter, "isAvailable" | "getActiveFilePath">;
  version?: string;
}

class HttpPayloadError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
  closeConnection = false,
): void {
  const payload = JSON.stringify(body);
  const headers: Record<string, string | number> = {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  };
  if (closeConnection) {
    headers.Connection = "close";
  }
  res.writeHead(statusCode, headers);
  res.end(payload);
}

function verifyBearerToken(authHeader: string | undefined, expectedToken: string): boolean {
  if (!expectedToken) return true;
  if (!authHeader) return false;

  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) return false;

  const provided = match[1].trim();
  const expectedDigest = createHash("sha256").update(expectedToken, "utf8").digest();
  const providedDigest = createHash("sha256").update(provided, "utf8").digest();
  return timingSafeEqual(expectedDigest, providedDigest);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const contentLengthHeader = req.headers["content-length"];
  if (contentLengthHeader !== undefined) {
    const declaredLength = Number.parseInt(String(contentLengthHeader), 10);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      req.resume();
      throw new HttpPayloadError(
        413,
        "PAYLOAD_TOO_LARGE",
        `Request body exceeds ${MAX_BODY_BYTES} bytes limit.`,
      );
    }
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    req.on("data", (chunk: Buffer | string) => {
      if (settled) return;
      const buf = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
      totalBytes += buf.length;
      if (totalBytes > MAX_BODY_BYTES) {
        req.pause();
        fail(
          new HttpPayloadError(
            413,
            "PAYLOAD_TOO_LARGE",
            `Request body exceeds ${MAX_BODY_BYTES} bytes limit.`,
          ),
        );
        return;
      }
      chunks.push(buf);
    });

    req.on("end", () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new HttpPayloadError(400, "INVALID_JSON", "Request body is not valid JSON."));
      }
    });

    req.on("error", (err) => {
      fail(err);
    });
  });
}

function mapActionError(
  err: unknown,
  requestId?: string,
): { statusCode: number; body: BridgeResponse<never> } {
  if (err instanceof HttpPayloadError) {
    return {
      statusCode: err.statusCode,
      body: {
        ok: false,
        error: { code: err.code, message: err.message },
        ...(requestId !== undefined ? { requestId } : {}),
      },
    };
  }
  if (err instanceof BridgeActionError) {
    return {
      statusCode: err.statusCode,
      body: {
        ok: false,
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
        ...(requestId !== undefined ? { requestId } : {}),
      },
    };
  }
  if (err instanceof EaAdapterError) {
    const statusCode =
      err.code === "VIEW_NOT_FOUND" || err.code === "NOT_FOUND"
        ? 404
        : err.code === "INVALID_PATH"
          ? 400
          : err.code === "EXCALIDRAW_UNAVAILABLE" || err.code === "NO_ACTIVE_VIEW"
            ? 409
            : 500;
    return {
      statusCode,
      body: {
        ok: false,
        error: { code: err.code, message: err.message },
        ...(requestId !== undefined ? { requestId } : {}),
      },
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    statusCode: 500,
    body: {
      ok: false,
      error: { code: "INTERNAL_ERROR", message },
      ...(requestId !== undefined ? { requestId } : {}),
    },
  };
}

export class BridgeServer {
  private readonly options: BridgeServerOptions;
  private server: Server | null = null;
  private boundPort: number | null = null;

  constructor(options: BridgeServerOptions) {
    this.options = options;
  }

  isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }

  getAddress(): { host: string; port: number } | null {
    if (!this.server || this.boundPort === null) return null;
    return { host: DEFAULT_BRIDGE_HOST, port: this.boundPort };
  }

  async start(): Promise<{ host: string; port: number }> {
    if (this.server) {
      await this.stop();
    }

    const server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        server.off("listening", onListening);
        reject(err);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.options.port, DEFAULT_BRIDGE_HOST);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to determine bound bridge server address.");
    }

    this.server = server;
    this.boundPort = address.port;
    return { host: DEFAULT_BRIDGE_HOST, port: address.port };
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.boundPort = null;
    if (!server) return;

    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
      server.closeAllConnections?.();
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = (req.method ?? "GET").toUpperCase();
    const rawUrl = req.url ?? "/";
    const pathname = rawUrl.split("?")[0] || "/";
    const authToken = this.options.getAuthToken?.() ?? "";

    if (method === "GET" && pathname === "/health") {
      const port = this.boundPort ?? this.options.port;
      sendJson(res, 200, {
        ok: true,
        status: "ok",
        host: DEFAULT_BRIDGE_HOST,
        port,
        mcpUrl: `http://${DEFAULT_BRIDGE_HOST}:${port}/mcp`,
        version: this.options.version ?? "0.1.0",
        authRequired: authToken.length > 0,
        eaAvailable: this.options.adapter.isAvailable(),
        activeFilePath: this.options.adapter.getActiveFilePath(),
      });
      return;
    }

    if (!verifyBearerToken(req.headers.authorization, authToken)) {
      sendJson(res, 401, {
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Missing or invalid Bearer auth token.",
        },
      } satisfies BridgeResponse<never>);
      return;
    }

    if (pathname === "/mcp") {
      if (method === "DELETE") {
        res.writeHead(200);
        res.end();
        return;
      }
      if (method !== "POST") {
        res.writeHead(405);
        res.end();
        return;
      }
      try {
        const parsed = await readJsonBody(req);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          res.writeHead(202);
          res.end();
          return;
        }
        const obj = parsed as Record<string, unknown>;
        if (Object.keys(obj).length === 0) {
          res.writeHead(202);
          res.end();
          return;
        }
        await handleMcpJsonRpc(
          obj,
          res,
          this.options.handlers,
          this.options.version ?? "0.1.0",
        );
      } catch (err) {
        if (err instanceof HttpPayloadError && err.statusCode === 413) {
          sendJson(
            res,
            413,
            {
              ok: false,
              error: { code: err.code, message: err.message },
            } satisfies BridgeResponse<never>,
            true,
          );
          return;
        }
        sendJson(res, 400, {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        });
      }
      return;
    }

    if (method === "POST" && pathname === "/rpc") {
      let requestId: string | undefined;
      try {
        const parsed = await readJsonBody(req);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new HttpPayloadError(400, "INVALID_REQUEST", "RPC body must be a JSON object.");
        }
        const rpc = parsed as Partial<BridgeRequest>;
        requestId = typeof rpc.requestId === "string" ? rpc.requestId : undefined;
        if (typeof rpc.action !== "string" || !ACTION_SET.has(rpc.action)) {
          throw new BridgeActionError(
            "UNKNOWN_ACTION",
            `Unknown or missing bridge action "${String(rpc.action ?? "")}".`,
            404,
          );
        }
        const action = rpc.action;
        const handler = this.options.handlers[action] as (input: unknown) => Promise<unknown>;
        const data = await handler(rpc.params ?? {});
        sendJson(res, 200, {
          ok: true,
          data,
          ...(requestId !== undefined ? { requestId } : {}),
        } satisfies BridgeResponse<unknown>);
      } catch (err) {
        const mapped = mapActionError(err, requestId);
        sendJson(res, mapped.statusCode, mapped.body, mapped.statusCode === 413);
      }
      return;
    }

    if (method === "POST" && pathname.startsWith("/action/")) {
      const actionName = decodeURIComponent(pathname.slice("/action/".length));
      if (!ACTION_SET.has(actionName)) {
        sendJson(res, 404, {
          ok: false,
          error: {
            code: "UNKNOWN_ACTION",
            message: `Unknown bridge action "${actionName}".`,
          },
        } satisfies BridgeResponse<never>);
        return;
      }

      let requestId: string | undefined;
      try {
        const parsed = await readJsonBody(req);
        if (parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed))) {
          throw new HttpPayloadError(400, "INVALID_REQUEST", "Action body must be a JSON object.");
        }
        const obj = (parsed ?? {}) as Record<string, unknown>;
        requestId = typeof obj.requestId === "string" ? obj.requestId : undefined;
        const params =
          "params" in obj && obj.params !== undefined && typeof obj.params === "object"
            ? obj.params
            : obj;

        const handler = this.options.handlers[actionName as BridgeAction] as (
          input: unknown,
        ) => Promise<unknown>;
        const data = await handler(params);
        sendJson(res, 200, {
          ok: true,
          data,
          ...(requestId !== undefined ? { requestId } : {}),
        } satisfies BridgeResponse<unknown>);
      } catch (err) {
        const mapped = mapActionError(err, requestId);
        sendJson(res, mapped.statusCode, mapped.body, mapped.statusCode === 413);
      }
      return;
    }

    sendJson(res, 404, {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: `Route ${method} ${pathname} not found.`,
      },
    } satisfies BridgeResponse<never>);
  }
}
