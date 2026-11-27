import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { validateVaultRelativePath } from "../shared/protocol.ts";
import type {
  CreateElementsInput,
  ExportImageInput,
  LayoutWarning,
  UpdateElementsInput,
} from "../shared/types.ts";
import type { BridgeClient } from "./bridge-client.ts";

const elementTypeSchema = z.enum([
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
]);

const pointSchema = z.array(z.number()).min(2).max(2);

const roundnessSchema = z
  .object({
    type: z.number(),
    value: z.number().optional(),
  })
  .nullable();

const elementBindingSchema = z
  .object({
    elementId: z.string(),
    focus: z.number().optional(),
    gap: z.number().optional(),
    fixedPoint: pointSchema.nullable().optional(),
  })
  .nullable();

const styleFieldsShape = {
  strokeColor: z.string().optional(),
  backgroundColor: z.string().optional(),
  fillStyle: z.string().optional(),
  strokeWidth: z.number().optional(),
  strokeStyle: z.string().optional(),
  roughness: z.number().optional(),
  opacity: z.number().optional(),
  roundness: roundnessSchema.optional(),
  fontFamily: z.number().optional(),
  fontSize: z.number().optional(),
  textAlign: z.string().optional(),
  verticalAlign: z.string().optional(),
  startArrowHead: z.string().nullable().optional(),
  endArrowHead: z.string().nullable().optional(),
  angle: z.number().optional(),
};

const elementStyleSchema = z.object(styleFieldsShape);

const elementLabelSchema = z.object({
  text: z.string(),
  fontSize: z.number().optional(),
  fontFamily: z.number().optional(),
  strokeColor: z.string().optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
});

const elementCreateSpecSchema = z.object({
  ...styleFieldsShape,
  id: z.string().optional(),
  type: elementTypeSchema,
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  text: z.string().optional(),
  points: z.array(pointSchema).optional(),
  frameId: z.string().nullable().optional(),
  groupIds: z.array(z.string()).optional(),
  containerId: z.string().nullable().optional(),
  startBinding: elementBindingSchema.optional(),
  endBinding: elementBindingSchema.optional(),
  label: elementLabelSchema.optional(),
  customData: z.record(z.string(), z.unknown()).optional(),
  style: elementStyleSchema.optional(),
});

const elementUpdatePatchSchema = z.object({
  ...styleFieldsShape,
  id: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  text: z.string().optional(),
  points: z.array(pointSchema).optional(),
  frameId: z.string().nullable().optional(),
  groupIds: z.array(z.string()).optional(),
  containerId: z.string().nullable().optional(),
  startBinding: elementBindingSchema.optional(),
  endBinding: elementBindingSchema.optional(),
  isDeleted: z.boolean().optional(),
  customData: z.record(z.string(), z.unknown()).optional(),
  style: elementStyleSchema.optional(),
});

const filePathField = z
  .string()
  .optional()
  .describe(
    "Optional vault-relative path to an open Excalidraw note (e.g. 'Drawings/arch.excalidraw.md'). Defaults to the active/first Excalidraw view.",
  );

function jsonResult(data: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [
      {
        type: "text",
        text: message,
      },
    ],
    isError: true,
  };
}

function extractLayoutWarnings(res: Record<string, unknown>): LayoutWarning[] {
  if (Array.isArray(res.layoutWarnings)) {
    return res.layoutWarnings as LayoutWarning[];
  }
  if (Array.isArray(res.warnings)) {
    return res.warnings as LayoutWarning[];
  }
  return [];
}

function normalizeMutationResult(res: Record<string, unknown>): Record<string, unknown> {
  const layoutWarnings = extractLayoutWarnings(res);
  return {
    ...res,
    layoutWarnings,
  };
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function runTool(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    return errorResult(err);
  }
}

export function registerAllTools(server: McpServer, bridgeClient: BridgeClient): void {
  server.registerTool(
    "get_scene_info",
    {
      description:
        "Inspect the target Excalidraw scene in Obsidian: filePath, title, elementCount, bounds, typeCounts, frameIds, and appState.",
      inputSchema: {
        filePath: filePathField,
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async (args) =>
      runTool(async () => {
        const res = await bridgeClient.callAction("get_scene_info", args);
        return jsonResult(res);
      }),
  );

  server.registerTool(
    "get_elements",
    {
      description:
        "Retrieve element snapshots from the Excalidraw scene, optionally filtered by element IDs.",
      inputSchema: {
        filePath: filePathField,
        ids: z.array(z.string()).optional().describe("Optional list of element IDs to retrieve."),
        includeDeleted: z
          .boolean()
          .optional()
          .describe("Include soft-deleted elements (default false)."),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async (args) =>
      runTool(async () => {
        const res = await bridgeClient.callAction("get_elements", args);
        return jsonResult(res);
      }),
  );

  server.registerTool(
    "search_elements",
    {
      description:
        "Search elements in the Excalidraw scene by text query, element type, frameId, or groupId.",
      inputSchema: {
        filePath: filePathField,
        query: z.string().optional().describe("Case-insensitive text substring to match."),
        types: z.array(elementTypeSchema).optional().describe("Filter by element types."),
        frameId: z.string().optional().describe("Filter by enclosing frame ID."),
        groupId: z.string().optional().describe("Filter by group ID."),
        limit: z.number().int().positive().optional().describe("Maximum elements to return."),
        includeDeleted: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async (args) =>
      runTool(async () => {
        const res = await bridgeClient.callAction("search_elements", args);
        return jsonResult(res);
      }),
  );

  server.registerTool(
    "get_selected_elements",
    {
      description: "Get the currently selected elements in the Excalidraw view.",
      inputSchema: {
        filePath: filePathField,
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async (args) =>
      runTool(async () => {
        const res = await bridgeClient.callAction("get_selected_elements", args);
        return jsonResult(res);
      }),
  );

  server.registerTool(
    "set_view",
    {
      description:
        "Pan and zoom the Excalidraw viewport to specific elements, full content, or explicit coordinates.",
      inputSchema: {
        filePath: filePathField,
        targetElementIds: z
          .array(z.string())
          .optional()
          .describe("Element IDs to center in the viewport."),
        scrollToContent: z
          .boolean()
          .optional()
          .describe("Fit all scene content (or targetElementIds) in view."),
        zoom: z.number().positive().optional().describe("Zoom factor (e.g. 1.0)."),
        scrollX: z.number().optional(),
        scrollY: z.number().optional(),
        padding: z.number().optional(),
      },
    },
    async (args) =>
      runTool(async () => {
        const res = await bridgeClient.callAction("set_view", args);
        return jsonResult(res);
      }),
  );

  server.registerTool(
    "create_elements",
    {
      description:
        "Create one or more Excalidraw elements (shapes, text, frames, lines, arrows) and return created snapshots plus layoutWarnings.",
      inputSchema: {
        filePath: filePathField,
        elements: z
          .array(elementCreateSpecSchema)
          .min(1)
          .describe("Elements to add to the scene."),
        selectCreated: z.boolean().optional(),
        scrollToCreated: z.boolean().optional(),
      },
    },
    async (args) =>
      runTool(async () => {
        const res = await bridgeClient.callAction(
          "create_elements",
          args as CreateElementsInput & Record<string, unknown>,
        );
        return jsonResult(normalizeMutationResult(res));
      }),
  );

  server.registerTool(
    "update_elements",
    {
      description:
        "Update properties (position, size, text, colors, bindings, etc.) of existing Excalidraw elements by ID and return layoutWarnings.",
      inputSchema: {
        filePath: filePathField,
        updates: z
          .array(elementUpdatePatchSchema)
          .min(1)
          .describe("Element patches keyed by id."),
      },
    },
    async (args) =>
      runTool(async () => {
        const res = await bridgeClient.callAction(
          "update_elements",
          args as UpdateElementsInput & Record<string, unknown>,
        );
        return jsonResult(normalizeMutationResult(res));
      }),
  );

  server.registerTool(
    "delete_elements",
    {
      description: "Delete elements by ID from the Excalidraw scene.",
      inputSchema: {
        filePath: filePathField,
        ids: z.array(z.string()).min(1).describe("Element IDs to delete."),
        deleteBoundElements: z
          .boolean()
          .optional()
          .describe("Also delete bound text/arrow elements attached to the deleted targets."),
      },
      annotations: {
        destructiveHint: true,
      },
    },
    async (args) =>
      runTool(async () => {
        const res = await bridgeClient.callAction("delete_elements", args);
        return jsonResult(normalizeMutationResult(res));
      }),
  );

  server.registerTool(
    "connect_elements",
    {
      description:
        "Create a bound arrow connecting two existing Excalidraw elements (fromId -> toId) with optional label, anchors, and line style, returning layoutWarnings.",
      inputSchema: {
        filePath: filePathField,
        fromId: z.string().describe("Source element ID."),
        toId: z.string().describe("Target element ID."),
        label: z.string().optional().describe("Optional arrow label."),
        startAnchor: z
          .enum(["auto", "top", "bottom", "left", "right", "center"])
          .optional(),
        endAnchor: z
          .enum(["auto", "top", "bottom", "left", "right", "center"])
          .optional(),
        lineType: z.enum(["straight", "curved", "elbow"]).optional(),
        style: elementStyleSchema.optional(),
      },
    },
    async (args) =>
      runTool(async () => {
        const res = await bridgeClient.callAction("connect_elements", args);
        return jsonResult(normalizeMutationResult(res));
      }),
  );

  server.registerTool(
    "add_mermaid",
    {
      description:
        "Convert Mermaid diagram syntax into native Excalidraw elements on the board and return layoutWarnings.",
      inputSchema: {
        filePath: filePathField,
        mermaid: z.string().min(1).describe("Mermaid diagram definition."),
        offsetX: z.number().optional(),
        offsetY: z.number().optional(),
        fontSize: z.number().positive().optional(),
      },
    },
    async (args) =>
      runTool(async () => {
        const res = await bridgeClient.callAction("add_mermaid", args);
        return jsonResult(normalizeMutationResult(res));
      }),
  );

  server.registerTool(
    "align_elements",
    {
      description:
        "Align or evenly distribute a list of elements (left, center, right, top, middle, bottom, distribute-horizontal, distribute-vertical).",
      inputSchema: {
        filePath: filePathField,
        ids: z.array(z.string()).min(2).describe("Element IDs to align or distribute."),
        alignment: z.enum([
          "left",
          "center",
          "right",
          "top",
          "middle",
          "bottom",
          "distribute-horizontal",
          "distribute-vertical",
        ]),
      },
    },
    async (args) =>
      runTool(async () => {
        const res = await bridgeClient.callAction("align_elements", args);
        return jsonResult(normalizeMutationResult(res));
      }),
  );

  server.registerTool(
    "restack_elements",
    {
      description: "Change z-order stacking of elements (front, back, forward, backward).",
      inputSchema: {
        filePath: filePathField,
        ids: z.array(z.string()).min(1).describe("Element IDs to restack."),
        direction: z.enum(["front", "back", "forward", "backward"]),
      },
    },
    async (args) =>
      runTool(async () => {
        const res = await bridgeClient.callAction("restack_elements", args);
        return jsonResult(res);
      }),
  );

  server.registerTool(
    "clear_scene",
    {
      description:
        "Remove all elements from the Excalidraw scene. Requires confirm: true to prevent accidental data loss.",
      inputSchema: {
        filePath: filePathField,
        confirm: z
          .boolean()
          .describe("Safety guard: must be true to clear the scene."),
      },
      annotations: {
        destructiveHint: true,
      },
    },
    async (args) =>
      runTool(async () => {
        if (args.confirm !== true) {
          return errorResult(
            "Refusing to clear scene: 'confirm' must be explicitly set to true.",
          );
        }
        const res = await bridgeClient.callAction("clear_scene", args);
        return jsonResult(res);
      }),
  );

  server.registerTool(
    "check_layout",
    {
      description:
        "Run deterministic layout analysis on the scene to detect text_overflow, shape_overlap, arrow_intersects_shape, and disconnected_arrow.",
      inputSchema: {
        filePath: filePathField,
        ids: z.array(z.string()).optional().describe("Optional subset of element IDs."),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async (args) =>
      runTool(async () => {
        const res = await bridgeClient.callAction("check_layout", args);
        const layoutWarnings = extractLayoutWarnings(res);
        return jsonResult({
          ...res,
          layoutWarnings,
        });
      }),
  );

  server.registerTool(
    "export_image",
    {
      description:
        "Export the Excalidraw board (or specific element IDs) as PNG or SVG. PNG returns both JSON metadata and a native MCP image block; SVG returns metadata and SVG text. Optionally saves to a vault-relative path via saveToVaultPath.",
      inputSchema: {
        filePath: filePathField,
        format: z
          .enum(["png", "svg"])
          .default("png")
          .describe("Export format: 'png' (default) or 'svg'."),
        ids: z
          .array(z.string())
          .optional()
          .describe("Optional subset of element IDs to export."),
        includeBoundElements: z
          .boolean()
          .optional()
          .describe("When ids are provided, automatically include bound text/arrows (default true)."),
        background: z.boolean().optional().describe("Include scene background color."),
        padding: z.number().nonnegative().optional().describe("Padding around exported bounds in px."),
        scale: z.number().positive().optional().describe("Export scale factor (e.g. 1 or 2)."),
        darkMode: z.boolean().optional().describe("Render using dark mode palette."),
        embedScene: z.boolean().optional().describe("Embed Excalidraw scene data in output."),
        saveToVaultPath: z
          .string()
          .optional()
          .describe(
            "Optional vault-relative path to save the exported image (e.g. 'Assets/architecture.png'), indexed immediately for Obsidian / Antidian read_note.",
          ),
        outputPath: z
          .string()
          .optional()
          .describe("Alias for saveToVaultPath (vault-relative path)."),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async (args) =>
      runTool(async () => {
        const requestedSavePath = args.saveToVaultPath ?? args.outputPath;
        if (requestedSavePath !== undefined) {
          const check = validateVaultRelativePath(requestedSavePath);
          if (!check.ok) {
            return errorResult(
              `Invalid vault-relative saveToVaultPath "${requestedSavePath}": ${check.error}`,
            );
          }
        }

        const payload: ExportImageInput & Record<string, unknown> = {
          format: args.format,
          ...(args.filePath !== undefined ? { filePath: args.filePath } : {}),
          ...(args.ids !== undefined ? { ids: args.ids } : {}),
          ...(args.includeBoundElements !== undefined
            ? { includeBoundElements: args.includeBoundElements }
            : {}),
          ...(args.background !== undefined ? { background: args.background } : {}),
          ...(args.padding !== undefined ? { padding: args.padding } : {}),
          ...(args.scale !== undefined ? { scale: args.scale } : {}),
          ...(args.darkMode !== undefined ? { darkMode: args.darkMode } : {}),
          ...(args.embedScene !== undefined ? { embedScene: args.embedScene } : {}),
          ...(requestedSavePath !== undefined
            ? {
                saveToVaultPath: requestedSavePath,
                outputPath: requestedSavePath,
              }
            : {}),
        };

        const res = await bridgeClient.callAction("export_image", payload);
        const savedPath =
          asNonEmptyString(res.savedPath) ??
          asNonEmptyString(res.savedToPath) ??
          null;
        const elementCount =
          typeof res.elementCount === "number"
            ? res.elementCount
            : Array.isArray(args.ids)
              ? args.ids.length
              : undefined;

        if (args.format === "png") {
          const base64 = asNonEmptyString(res.base64) ?? asNonEmptyString(res.data);
          if (!base64) {
            return errorResult(
              "Bridge export_image response for format 'png' did not include base64 image data.",
            );
          }
          const mimeType = asNonEmptyString(res.mimeType) ?? "image/png";
          const sizeBytes =
            typeof res.sizeBytes === "number"
              ? res.sizeBytes
              : Buffer.from(base64, "base64").byteLength;

          const metadata = {
            filePath: res.filePath,
            format: "png" as const,
            mimeType,
            sizeBytes,
            ...(elementCount !== undefined ? { elementCount } : {}),
            ...(typeof res.width === "number" ? { width: res.width } : {}),
            ...(typeof res.height === "number" ? { height: res.height } : {}),
            savedPath,
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(metadata, null, 2),
              },
              {
                type: "image",
                data: base64,
                mimeType,
              },
            ],
          };
        }

        const svgText = asNonEmptyString(res.svg) ?? asNonEmptyString(res.data);
        if (svgText === undefined) {
          return errorResult(
            "Bridge export_image response for format 'svg' did not include SVG text.",
          );
        }
        const mimeType = asNonEmptyString(res.mimeType) ?? "image/svg+xml";
        const sizeBytes =
          typeof res.sizeBytes === "number"
            ? res.sizeBytes
            : Buffer.byteLength(svgText, "utf8");

        const metadata = {
          filePath: res.filePath,
          format: "svg" as const,
          mimeType,
          sizeBytes,
          ...(elementCount !== undefined ? { elementCount } : {}),
          ...(typeof res.width === "number" ? { width: res.width } : {}),
          ...(typeof res.height === "number" ? { height: res.height } : {}),
          savedPath,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(metadata, null, 2),
            },
            {
              type: "text",
              text: svgText,
            },
          ],
        };
      }),
  );
}
