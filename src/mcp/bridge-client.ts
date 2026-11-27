import {
  DEFAULT_BRIDGE_HOST,
  DEFAULT_BRIDGE_PORT,
  type BridgeAction,
  type BridgeRequest,
  type BridgeResponse,
} from "../shared/protocol.ts";
import type { BridgeActionPayloads } from "../shared/types.ts";

export interface BridgeHealthResult {
  ok: boolean;
  status?: string;
  port?: number;
  pluginVersion?: string;
  hasExcalidrawPlugin?: boolean;
  hasActiveBoard?: boolean;
  activeFilePath?: string | null;
  [key: string]: unknown;
}

export interface BridgeClient {
  callAction<A extends BridgeAction>(
    action: A,
    payload: BridgeActionPayloads[A]["input"] & Record<string, unknown>,
  ): Promise<BridgeActionPayloads[A]["output"] & Record<string, unknown>>;
  health(): Promise<BridgeHealthResult>;
}

export interface HttpBridgeClientOptions {
  host?: string;
  port?: number;
  token?: string;
  timeoutMs?: number;
}

export class BridgeClientError extends Error {
  readonly code: string;
  readonly statusCode?: number;
  readonly details?: unknown;

  constructor(
    message: string,
    code = "BRIDGE_ERROR",
    statusCode?: number,
    details?: unknown,
  ) {
    super(message);
    this.name = "BridgeClientError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

function extractErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") {
    return undefined;
  }
  const record = err as { code?: unknown; cause?: unknown; name?: unknown };
  if (typeof record.code === "string") {
    return record.code;
  }
  if (record.cause && typeof record.cause === "object") {
    const cause = record.cause as { code?: unknown };
    if (typeof cause.code === "string") {
      return cause.code;
    }
  }
  if (typeof record.name === "string") {
    return record.name;
  }
  return undefined;
}

function formatBridgeActionError(
  baseUrl: string,
  code: string,
  message: string,
  statusCode?: number,
  details?: unknown,
): BridgeClientError {
  if (statusCode === 401 || statusCode === 403 || code === "UNAUTHORIZED") {
    return new BridgeClientError(
      `Unauthorized (HTTP ${statusCode ?? 401}) from Obsidian Excalidraw MCP bridge at ${baseUrl}. ` +
        `Set OBSIDIAN_EXCALIDRAW_MCP_TOKEN to match the Auth Token in Obsidian -> Settings -> Obsidian Excalidraw MCP.`,
      "UNAUTHORIZED",
      statusCode ?? 401,
      details,
    );
  }

  const normalizedCode = code.toUpperCase();
  const lowerMessage = message.toLowerCase();
  if (
    normalizedCode === "NO_ACTIVE_VIEW" ||
    normalizedCode === "NO_EXCALIDRAW_VIEW" ||
    normalizedCode === "NO_BOARD_OPEN" ||
    normalizedCode === "NO_VIEW_OPEN" ||
    lowerMessage.includes("no excalidraw view") ||
    lowerMessage.includes("no active excalidraw") ||
    lowerMessage.includes("no board open")
  ) {
    return new BridgeClientError(
      `${message} Open an Excalidraw drawing (.excalidraw or .excalidraw.md) in Obsidian, or pass 'filePath' to target a specific open drawing.`,
      code,
      statusCode,
      details,
    );
  }

  return new BridgeClientError(message, code, statusCode, details);
}

export class HttpBridgeClient implements BridgeClient {
  readonly baseUrl: string;
  readonly port: number;
  readonly host: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private requestCounter = 0;

  constructor(options: HttpBridgeClientOptions = {}) {
    this.host = options.host?.trim() || DEFAULT_BRIDGE_HOST;
    this.port = options.port ?? DEFAULT_BRIDGE_PORT;
    this.token = options.token?.trim() || "";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.baseUrl = `http://${this.host}:${this.port}`;
  }

  private buildHeaders(includeJsonContentType: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (includeJsonContentType) {
      headers["Content-Type"] = "application/json";
    }
    if (this.token.length > 0) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  private wrapNetworkError(err: unknown): BridgeClientError {
    if (err instanceof BridgeClientError) {
      return err;
    }

    const errCode = extractErrorCode(err);
    const errMessage = err instanceof Error ? err.message : String(err);

    if (
      errCode === "ECONNREFUSED" ||
      errMessage.includes("ECONNREFUSED") ||
      errMessage.includes("fetch failed")
    ) {
      return new BridgeClientError(
        `Cannot connect to Obsidian Excalidraw MCP bridge at ${this.baseUrl} (${errCode ?? "ECONNREFUSED"}). ` +
          `Ensure Obsidian is running, the 'Obsidian Excalidraw MCP' community plugin is enabled, and the local bridge is listening on port ${this.port}.`,
        "ECONNREFUSED",
      );
    }

    if (errCode === "TimeoutError" || errCode === "AbortError") {
      return new BridgeClientError(
        `Timed out waiting for Obsidian Excalidraw MCP bridge at ${this.baseUrl} after ${this.timeoutMs}ms.`,
        "TIMEOUT",
      );
    }

    return new BridgeClientError(
      `Bridge request to ${this.baseUrl} failed: ${errMessage}`,
      errCode ?? "NETWORK_ERROR",
    );
  }

  async health(): Promise<BridgeHealthResult> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        headers: this.buildHeaders(false),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw this.wrapNetworkError(err);
    }

    if (response.status === 401 || response.status === 403) {
      throw formatBridgeActionError(
        this.baseUrl,
        "UNAUTHORIZED",
        "Unauthorized",
        response.status,
      );
    }

    const rawText = await response.text();
    let parsed: Record<string, unknown>;
    try {
      parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      throw new BridgeClientError(
        `Bridge /health returned invalid JSON (HTTP ${response.status}): ${rawText.slice(0, 200)}`,
        "INVALID_RESPONSE",
        response.status,
      );
    }

    if (!response.ok) {
      const errorObj =
        parsed.error && typeof parsed.error === "object"
          ? (parsed.error as { code?: unknown; message?: unknown; details?: unknown })
          : undefined;
      throw formatBridgeActionError(
        this.baseUrl,
        typeof errorObj?.code === "string" ? errorObj.code : `HTTP_${response.status}`,
        typeof errorObj?.message === "string"
          ? errorObj.message
          : `Bridge health check failed with HTTP ${response.status}.`,
        response.status,
        errorObj?.details,
      );
    }

    return {
      ok: typeof parsed.ok === "boolean" ? parsed.ok : true,
      ...parsed,
    };
  }

  async callAction<A extends BridgeAction>(
    action: A,
    payload: BridgeActionPayloads[A]["input"] & Record<string, unknown>,
  ): Promise<BridgeActionPayloads[A]["output"] & Record<string, unknown>> {
    this.requestCounter += 1;
    const requestBody: BridgeRequest<A> = {
      action,
      params: payload,
      requestId: `mcp-${Date.now()}-${this.requestCounter}`,
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/rpc`, {
        method: "POST",
        headers: this.buildHeaders(true),
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw this.wrapNetworkError(err);
    }

    if (response.status === 401 || response.status === 403) {
      throw formatBridgeActionError(
        this.baseUrl,
        "UNAUTHORIZED",
        "Unauthorized",
        response.status,
      );
    }

    const rawText = await response.text();
    let parsed: BridgeResponse<BridgeActionPayloads[A]["output"] & Record<string, unknown>>;
    try {
      parsed = JSON.parse(rawText) as BridgeResponse<
        BridgeActionPayloads[A]["output"] & Record<string, unknown>
      >;
    } catch {
      throw new BridgeClientError(
        `Bridge returned non-JSON response for '${action}' (HTTP ${response.status}): ${rawText.slice(0, 200)}`,
        "INVALID_RESPONSE",
        response.status,
      );
    }

    if (!parsed || typeof parsed !== "object") {
      throw new BridgeClientError(
        `Bridge returned unexpected response payload for '${action}' (HTTP ${response.status}).`,
        "INVALID_RESPONSE",
        response.status,
      );
    }

    if (parsed.ok === false) {
      const errCode = parsed.error?.code || `HTTP_${response.status}`;
      const errMsg = parsed.error?.message || `Action '${action}' failed.`;
      throw formatBridgeActionError(
        this.baseUrl,
        errCode,
        errMsg,
        response.status,
        parsed.error?.details,
      );
    }

    if (!response.ok) {
      throw new BridgeClientError(
        `Bridge returned HTTP ${response.status} for '${action}'.`,
        `HTTP_${response.status}`,
        response.status,
      );
    }

    if (!("data" in parsed)) {
      throw new BridgeClientError(
        `Bridge response for '${action}' is missing 'data'.`,
        "INVALID_RESPONSE",
        response.status,
      );
    }

    return parsed.data;
  }
}

export function createBridgeClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): HttpBridgeClient {
  const rawPort = env.OBSIDIAN_EXCALIDRAW_MCP_PORT?.trim();
  let port = DEFAULT_BRIDGE_PORT;
  if (rawPort && rawPort.length > 0) {
    const parsed = Number(rawPort);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new BridgeClientError(
        `Invalid OBSIDIAN_EXCALIDRAW_MCP_PORT value "${rawPort}". Expected an integer between 1 and 65535.`,
        "INVALID_CONFIG",
      );
    }
    port = parsed;
  }

  const host = env.OBSIDIAN_EXCALIDRAW_MCP_HOST?.trim() || DEFAULT_BRIDGE_HOST;
  const token = env.OBSIDIAN_EXCALIDRAW_MCP_TOKEN?.trim() || "";

  return new HttpBridgeClient({ host, port, token });
}
