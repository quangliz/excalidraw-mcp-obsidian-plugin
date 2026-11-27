import type { ServerResponse } from "node:http";
import { validateVaultRelativePath, type BridgeAction } from "../shared/protocol.ts";
import type { ExportImageOutput, LayoutWarning } from "../shared/types.ts";
import type { BridgeHandlerMap } from "./handlers.ts";

export interface McpToolSchema {
  name: BridgeAction;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const ELEMENT_TYPES = [
  "rectangle",
  "ellipse",
  "diamond",
  "text",
  "arrow",
  "line",
  "frame",
  "freedraw",
  "image",
  "embeddable",
];

const FILE_PATH_PROP = {
  type: "string",
  description:
    "Optional vault-relative path to an open Excalidraw note (e.g. 'Drawings/arch.excalidraw.md'). Defaults to the active/first Excalidraw view.",
};

const POINT_SCHEMA = {
  type: "array",
  items: { type: "number" },
  minItems: 2,
  maxItems: 2,
};

const ROUNDNESS_SCHEMA = {
  anyOf: [
    {
      type: "object",
      properties: {
        type: { type: "number" },
        value: { type: "number" },
      },
      required: ["type"],
    },
    { type: "null" },
  ],
};

const BINDING_SCHEMA = {
  anyOf: [
    {
      type: "object",
      properties: {
        elementId: { type: "string" },
        focus: { type: "number" },
        gap: { type: "number" },
        fixedPoint: {
          anyOf: [POINT_SCHEMA, { type: "null" }],
        },
      },
      required: ["elementId"],
    },
    { type: "null" },
  ],
};

const STYLE_PROPS: Record<string, unknown> = {
  strokeColor: { type: "string" },
  backgroundColor: { type: "string" },
  fillStyle: { type: "string" },
  strokeWidth: { type: "number" },
  strokeStyle: { type: "string" },
  roughness: { type: "number" },
  opacity: { type: "number" },
  roundness: ROUNDNESS_SCHEMA,
  fontFamily: { type: "number" },
  fontSize: { type: "number" },
  textAlign: { type: "string" },
  verticalAlign: { type: "string" },
  startArrowHead: { type: ["string", "null"] },
  endArrowHead: { type: ["string", "null"] },
  angle: { type: "number" },
};

const ELEMENT_STYLE_SCHEMA = {
  type: "object",
  properties: STYLE_PROPS,
};

export const MCP_TOOLS: McpToolSchema[] = [
  {
    name: "get_scene_info",
    description:
      "Inspect the target Excalidraw scene in Obsidian: filePath, title, elementCount, bounds, typeCounts, frameIds, and appState.",
    inputSchema: {
      type: "object",
      properties: { filePath: FILE_PATH_PROP },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_elements",
    description:
      "Retrieve element snapshots from the Excalidraw scene, optionally filtered by element IDs.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: FILE_PATH_PROP,
        ids: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of element IDs to retrieve.",
        },
        includeDeleted: {
          type: "boolean",
          description: "Include soft-deleted elements (default false).",
        },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "search_elements",
    description:
      "Search elements in the Excalidraw scene by text query, element type, frameId, or groupId.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: FILE_PATH_PROP,
        query: { type: "string", description: "Case-insensitive text substring to match." },
        types: {
          type: "array",
          items: { type: "string", enum: ELEMENT_TYPES },
          description: "Filter by element types.",
        },
        frameId: { type: "string", description: "Filter by enclosing frame ID." },
        groupId: { type: "string", description: "Filter by group ID." },
        limit: { type: "integer", minimum: 1, description: "Maximum elements to return." },
        includeDeleted: { type: "boolean" },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_selected_elements",
    description: "Get the currently selected elements in the Excalidraw view.",
    inputSchema: {
      type: "object",
      properties: { filePath: FILE_PATH_PROP },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "set_view",
    description:
      "Pan and zoom the Excalidraw viewport to specific elements, full content, or explicit coordinates.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: FILE_PATH_PROP,
        targetElementIds: {
          type: "array",
          items: { type: "string" },
          description: "Element IDs to center in the viewport.",
        },
        scrollToContent: {
          type: "boolean",
          description: "Fit all scene content (or targetElementIds) in view.",
        },
        zoom: { type: "number", exclusiveMinimum: 0, description: "Zoom factor (e.g. 1.0)." },
        scrollX: { type: "number" },
        scrollY: { type: "number" },
        padding: { type: "number" },
      },
    },
  },
  {
    name: "create_elements",
    description:
      "Create one or more Excalidraw elements (shapes, text, frames, lines, arrows) and return created snapshots plus layoutWarnings.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: FILE_PATH_PROP,
        elements: {
          type: "array",
          minItems: 1,
          description: "Elements to add to the scene.",
          items: {
            type: "object",
            properties: {
              ...STYLE_PROPS,
              id: { type: "string" },
              type: { type: "string", enum: ELEMENT_TYPES },
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
              text: { type: "string" },
              points: { type: "array", items: POINT_SCHEMA },
              frameId: { type: ["string", "null"] },
              groupIds: { type: "array", items: { type: "string" } },
              containerId: { type: ["string", "null"] },
              startBinding: BINDING_SCHEMA,
              endBinding: BINDING_SCHEMA,
              label: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  fontSize: { type: "number" },
                  fontFamily: { type: "number" },
                  strokeColor: { type: "string" },
                  textAlign: { type: "string", enum: ["left", "center", "right"] },
                  verticalAlign: { type: "string", enum: ["top", "middle", "bottom"] },
                },
                required: ["text"],
              },
              customData: { type: "object", additionalProperties: true },
              style: ELEMENT_STYLE_SCHEMA,
            },
            required: ["type", "x", "y"],
          },
        },
        selectCreated: { type: "boolean" },
        scrollToCreated: { type: "boolean" },
      },
      required: ["elements"],
    },
  },
  {
    name: "update_elements",
    description:
      "Update properties (position, size, text, colors, bindings, etc.) of existing Excalidraw elements by ID and return layoutWarnings.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: FILE_PATH_PROP,
        updates: {
          type: "array",
          minItems: 1,
          description: "Element patches keyed by id.",
          items: {
            type: "object",
            properties: {
              ...STYLE_PROPS,
              id: { type: "string" },
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
              text: { type: "string" },
              points: { type: "array", items: POINT_SCHEMA },
              frameId: { type: ["string", "null"] },
              groupIds: { type: "array", items: { type: "string" } },
              containerId: { type: ["string", "null"] },
              startBinding: BINDING_SCHEMA,
              endBinding: BINDING_SCHEMA,
              isDeleted: { type: "boolean" },
              customData: { type: "object", additionalProperties: true },
              style: ELEMENT_STYLE_SCHEMA,
            },
            required: ["id"],
          },
        },
      },
      required: ["updates"],
    },
  },
  {
    name: "delete_elements",
    description: "Delete elements by ID from the Excalidraw scene.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: FILE_PATH_PROP,
        ids: {
          type: "array",
          minItems: 1,
          items: { type: "string" },
          description: "Element IDs to delete.",
        },
        deleteBoundElements: {
          type: "boolean",
          description: "Also delete bound text/arrow elements attached to the deleted targets.",
        },
      },
      required: ["ids"],
    },
    annotations: { destructiveHint: true },
  },
  {
    name: "connect_elements",
    description:
      "Create a bound arrow connecting two existing Excalidraw elements (fromId -> toId) with optional label, anchors, and line style, returning layoutWarnings.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: FILE_PATH_PROP,
        fromId: { type: "string", description: "Source element ID." },
        toId: { type: "string", description: "Target element ID." },
        label: { type: "string", description: "Optional arrow label." },
        startAnchor: {
          type: "string",
          enum: ["auto", "top", "bottom", "left", "right", "center"],
        },
        endAnchor: {
          type: "string",
          enum: ["auto", "top", "bottom", "left", "right", "center"],
        },
        lineType: { type: "string", enum: ["straight", "curved", "elbow"] },
        style: ELEMENT_STYLE_SCHEMA,
      },
      required: ["fromId", "toId"],
    },
  },
  {
    name: "add_mermaid",
    description:
      "Convert Mermaid diagram syntax into native Excalidraw elements on the board and return layoutWarnings.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: FILE_PATH_PROP,
        mermaid: { type: "string", minLength: 1, description: "Mermaid diagram definition." },
        offsetX: { type: "number" },
        offsetY: { type: "number" },
        fontSize: { type: "number", exclusiveMinimum: 0 },
      },
      required: ["mermaid"],
    },
  },
  {
    name: "align_elements",
    description:
      "Align or evenly distribute a list of elements (left, center, right, top, middle, bottom, distribute-horizontal, distribute-vertical).",
    inputSchema: {
      type: "object",
      properties: {
        filePath: FILE_PATH_PROP,
        ids: {
          type: "array",
          minItems: 2,
          items: { type: "string" },
          description: "Element IDs to align or distribute.",
        },
        alignment: {
          type: "string",
          enum: [
            "left",
            "center",
            "right",
            "top",
            "middle",
            "bottom",
            "distribute-horizontal",
            "distribute-vertical",
          ],
        },
      },
      required: ["ids", "alignment"],
    },
  },
  {
    name: "restack_elements",
    description: "Change z-order stacking of elements (front, back, forward, backward).",
    inputSchema: {
      type: "object",
      properties: {
        filePath: FILE_PATH_PROP,
        ids: {
          type: "array",
          minItems: 1,
          items: { type: "string" },
          description: "Element IDs to restack.",
        },
        direction: { type: "string", enum: ["front", "back", "forward", "backward"] },
      },
      required: ["ids", "direction"],
    },
  },
  {
    name: "clear_scene",
    description:
      "Remove all elements from the Excalidraw scene. Requires confirm: true to prevent accidental data loss.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: FILE_PATH_PROP,
        confirm: {
          type: "boolean",
          description: "Safety guard: must be true to clear the scene.",
        },
      },
      required: ["confirm"],
    },
    annotations: { destructiveHint: true },
  },
  {
    name: "check_layout",
    description:
      "Run deterministic layout analysis on the scene to detect text_overflow, shape_overlap, arrow_intersects_shape, and disconnected_arrow.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: FILE_PATH_PROP,
        ids: {
          type: "array",
          items: { type: "string" },
          description: "Optional subset of element IDs.",
        },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "export_image",
    description:
      "Export the Excalidraw board (or specific element IDs) as PNG or SVG. PNG returns both JSON metadata and a native MCP image block; SVG returns metadata and SVG text. Optionally saves to a vault-relative path via saveToVaultPath.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: FILE_PATH_PROP,
        format: {
          type: "string",
          enum: ["png", "svg"],
          default: "png",
          description: "Export format: 'png' (default) or 'svg'.",
        },
        ids: {
          type: "array",
          items: { type: "string" },
          description: "Optional subset of element IDs to export.",
        },
        includeBoundElements: {
          type: "boolean",
          description:
            "When ids are provided, automatically include bound text/arrows (default true).",
        },
        background: { type: "boolean", description: "Include scene background color." },
        padding: {
          type: "number",
          minimum: 0,
          description: "Padding around exported bounds in px.",
        },
        scale: {
          type: "number",
          exclusiveMinimum: 0,
          description: "Export scale factor (e.g. 1 or 2).",
        },
        darkMode: { type: "boolean", description: "Render using dark mode palette." },
        embedScene: { type: "boolean", description: "Embed Excalidraw scene data in output." },
        saveToVaultPath: {
          type: "string",
          description:
            "Optional vault-relative path to save the exported image (e.g. 'Assets/architecture.png'), indexed immediately for Obsidian / Antidian read_note.",
        },
        outputPath: {
          type: "string",
          description: "Alias for saveToVaultPath (vault-relative path).",
        },
      },
    },
    annotations: { readOnlyHint: true },
  },
];

const TOOL_SET = new Set<string>(MCP_TOOLS.map((t) => t.name));

const MUTATING_WARNING_ACTIONS = new Set<string>([
  "create_elements",
  "update_elements",
  "delete_elements",
  "connect_elements",
  "add_mermaid",
  "align_elements",
]);

function sendJsonRpc(
  res: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function sendRpcResult(
  res: ServerResponse,
  id: string | number | null | undefined,
  result: unknown,
): void {
  sendJsonRpc(res, 200, {
    jsonrpc: "2.0",
    id: id ?? null,
    result,
  });
}

function sendToolError(
  res: ServerResponse,
  id: string | number | null | undefined,
  message: string,
): void {
  sendRpcResult(res, id, {
    isError: true,
    content: [{ type: "text", text: message }],
  });
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeMutationPayload(res: Record<string, unknown>): Record<string, unknown> {
  const layoutWarnings = Array.isArray(res.layoutWarnings)
    ? (res.layoutWarnings as LayoutWarning[])
    : Array.isArray(res.warnings)
      ? (res.warnings as LayoutWarning[])
      : [];
  return { ...res, layoutWarnings };
}

function formatExportToolResult(
  args: Record<string, unknown>,
  rawRes: ExportImageOutput & Record<string, unknown>,
): Record<string, unknown> {
  const format = args.format === "svg" ? "svg" : "png";
  const savedPath =
    asNonEmptyString(rawRes.savedPath) ??
    asNonEmptyString((rawRes as { savedToPath?: unknown }).savedToPath) ??
    null;
  const elementCount =
    typeof rawRes.elementCount === "number"
      ? rawRes.elementCount
      : Array.isArray(args.ids)
        ? args.ids.length
        : undefined;

  if (format === "png") {
    const base64 = asNonEmptyString(rawRes.base64) ?? asNonEmptyString(rawRes.data);
    if (!base64) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "Bridge export_image response for format 'png' did not include base64 image data.",
          },
        ],
      };
    }
    const mimeType = asNonEmptyString(rawRes.mimeType) ?? "image/png";
    const sizeBytes =
      typeof rawRes.sizeBytes === "number"
        ? rawRes.sizeBytes
        : Buffer.from(base64, "base64").byteLength;

    const metadata = {
      filePath: rawRes.filePath,
      format: "png",
      mimeType,
      sizeBytes,
      ...(elementCount !== undefined ? { elementCount } : {}),
      ...(typeof rawRes.width === "number" ? { width: rawRes.width } : {}),
      ...(typeof rawRes.height === "number" ? { height: rawRes.height } : {}),
      savedPath,
    };

    return {
      content: [
        { type: "text", text: JSON.stringify(metadata, null, 2) },
        { type: "image", data: base64, mimeType },
      ],
    };
  }

  const svgText =
    asNonEmptyString((rawRes as { svg?: unknown }).svg) ?? asNonEmptyString(rawRes.data);
  if (svgText === undefined) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "Bridge export_image response for format 'svg' did not include SVG text.",
        },
      ],
    };
  }
  const mimeType = asNonEmptyString(rawRes.mimeType) ?? "image/svg+xml";
  const sizeBytes =
    typeof rawRes.sizeBytes === "number" ? rawRes.sizeBytes : Buffer.byteLength(svgText, "utf8");

  const metadata = {
    filePath: rawRes.filePath,
    format: "svg",
    mimeType,
    sizeBytes,
    ...(elementCount !== undefined ? { elementCount } : {}),
    ...(typeof rawRes.width === "number" ? { width: rawRes.width } : {}),
    ...(typeof rawRes.height === "number" ? { height: rawRes.height } : {}),
    savedPath,
  };

  return {
    content: [
      { type: "text", text: JSON.stringify(metadata, null, 2) },
      { type: "text", text: svgText },
    ],
  };
}

export async function handleMcpJsonRpc(
  msg: JsonRpcRequest,
  res: ServerResponse,
  handlers: BridgeHandlerMap,
  version: string,
): Promise<void> {
  const method = typeof msg.method === "string" ? msg.method : "";
  if (method === "notifications/initialized" || (msg.id === undefined && method.startsWith("notifications/"))) {
    res.writeHead(202);
    res.end();
    return;
  }

  if (method === "initialize") {
    sendRpcResult(res, msg.id, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "excalidraw", version },
    });
    return;
  }

  if (method === "ping") {
    sendRpcResult(res, msg.id, {});
    return;
  }

  if (method === "tools/list") {
    sendRpcResult(res, msg.id, { tools: MCP_TOOLS });
    return;
  }

  if (method === "tools/call") {
    const params = msg.params && typeof msg.params === "object" ? msg.params : {};
    const name = typeof params.name === "string" ? params.name : "";
    const args =
      params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
        ? (params.arguments as Record<string, unknown>)
        : {};

    if (!TOOL_SET.has(name)) {
      sendToolError(res, msg.id, `Tool "${name}" not found.`);
      return;
    }

    if (name === "clear_scene" && args.confirm !== true) {
      sendToolError(res, msg.id, "Refusing to clear scene: 'confirm' must be explicitly set to true.");
      return;
    }

    if (name === "export_image") {
      const requestedSavePath = args.saveToVaultPath ?? args.outputPath;
      if (requestedSavePath !== undefined) {
        if (typeof requestedSavePath !== "string") {
          sendToolError(res, msg.id, "saveToVaultPath must be a string.");
          return;
        }
        const check = validateVaultRelativePath(requestedSavePath);
        if (!check.ok) {
          sendToolError(
            res,
            msg.id,
            `Invalid vault-relative saveToVaultPath "${requestedSavePath}": ${check.error}`,
          );
          return;
        }
      }
    }

    try {
      const handler = handlers[name as BridgeAction] as (input: unknown) => Promise<unknown>;
      const forwardArgs =
        name === "export_image"
          ? {
              ...args,
              format: args.format === "svg" ? "svg" : "png",
              ...(args.saveToVaultPath !== undefined || args.outputPath !== undefined
                ? {
                    saveToVaultPath: args.saveToVaultPath ?? args.outputPath,
                    outputPath: args.saveToVaultPath ?? args.outputPath,
                  }
                : {}),
            }
          : args;

      const rawOutput = await handler(forwardArgs);

      if (name === "export_image") {
        sendRpcResult(
          res,
          msg.id,
          formatExportToolResult(args, rawOutput as ExportImageOutput & Record<string, unknown>),
        );
        return;
      }

      const payload =
        MUTATING_WARNING_ACTIONS.has(name) || name === "check_layout"
          ? normalizeMutationPayload((rawOutput ?? {}) as Record<string, unknown>)
          : rawOutput;

      sendRpcResult(res, msg.id, {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendToolError(res, msg.id, message);
    }
    return;
  }

  sendJsonRpc(res, 200, {
    jsonrpc: "2.0",
    id: msg.id ?? null,
    error: {
      code: -32601,
      message: `Method not found: ${method}`,
    },
  });
}
