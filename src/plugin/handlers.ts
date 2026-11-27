import { analyzeLayout } from "../shared/layout.ts";
import { validateVaultRelativePath, type BridgeAction } from "../shared/protocol.ts";
import type {
  AddMermaidInput,
  AddMermaidOutput,
  AlignElementsInput,
  AlignElementsOutput,
  AlignmentMode,
  BridgeActionPayloads,
  CheckLayoutInput,
  CheckLayoutOutput,
  ClearSceneInput,
  ClearSceneOutput,
  ConnectElementsInput,
  ConnectElementsOutput,
  CreateElementsInput,
  CreateElementsOutput,
  DeleteElementsInput,
  DeleteElementsOutput,
  ElementSnapshot,
  ElementType,
  ExportImageOutput,
  GetElementsInput,
  GetElementsOutput,
  GetSceneInfoInput,
  GetSceneInfoOutput,
  GetSelectedElementsInput,
  GetSelectedElementsOutput,
  RestackDirection,
  RestackElementsInput,
  RestackElementsOutput,
  SceneBounds,
  SearchElementsInput,
  SearchElementsOutput,
  SetViewInput,
  SetViewOutput,
  UpdateElementsInput,
  UpdateElementsOutput,
} from "../shared/types.ts";
import type { EaAdapter, ElementPositionPatch, ExtendedExportImageInput } from "./ea-adapter.ts";

export class BridgeActionError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: string, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = "BridgeActionError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export type BridgeHandlerMap = {
  [K in BridgeAction]: (
    input: BridgeActionPayloads[K]["input"],
  ) => Promise<BridgeActionPayloads[K]["output"]>;
};

const VALID_ALIGNMENTS = new Set<AlignmentMode>([
  "left",
  "center",
  "right",
  "top",
  "middle",
  "bottom",
  "distribute-horizontal",
  "distribute-vertical",
]);

const VALID_RESTACK_DIRECTIONS = new Set<RestackDirection>([
  "front",
  "back",
  "forward",
  "backward",
]);

function normalizeAlignment(mode: string): AlignmentMode {
  if (mode === "centerX") return "center";
  if (mode === "centerY") return "middle";
  if (mode === "distribute_horizontal") return "distribute-horizontal";
  if (mode === "distribute_vertical") return "distribute-vertical";
  if (VALID_ALIGNMENTS.has(mode as AlignmentMode)) {
    return mode as AlignmentMode;
  }
  throw new BridgeActionError(
    "INVALID_PARAMS",
    `Unsupported alignment "${mode}". Expected one of: ${Array.from(VALID_ALIGNMENTS).join(", ")}.`,
  );
}

function computeSceneBounds(elements: ElementSnapshot[]): SceneBounds | null {
  const active = elements.filter((el) => !el.isDeleted);
  if (active.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of active) {
    const x1 = Math.min(el.x, el.x + el.width);
    const y1 = Math.min(el.y, el.y + el.height);
    const x2 = Math.max(el.x, el.x + el.width);
    const y2 = Math.max(el.y, el.y + el.height);
    if (x1 < minX) minX = x1;
    if (y1 < minY) minY = y1;
    if (x2 > maxX) maxX = x2;
    if (y2 > maxY) maxY = y2;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function getBoundTextMap(elements: ElementSnapshot[]): Map<string, string> {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const result = new Map<string, string>();
  for (const el of elements) {
    if (el.isDeleted) continue;
    if (el.type === "text") {
      const value = el.text ?? el.rawText ?? "";
      if (el.containerId) {
        const existing = result.get(el.containerId);
        result.set(el.containerId, existing ? `${existing}\n${value}` : value);
      }
      result.set(el.id, value);
      continue;
    }
    if (el.boundElements) {
      const parts: string[] = [];
      for (const ref of el.boundElements) {
        if (ref.type === "text") {
          const t = byId.get(ref.id);
          const value = t?.text ?? t?.rawText;
          if (value) parts.push(value);
        }
      }
      if (parts.length > 0) {
        result.set(el.id, parts.join("\n"));
      }
    }
    if (el.text && !result.has(el.id)) {
      result.set(el.id, el.text);
    }
  }
  return result;
}

function computeAlignmentPatches(
  allElements: ElementSnapshot[],
  targetIds: string[],
  alignment: AlignmentMode,
): { alignedIds: string[]; patches: ElementPositionPatch[] } {
  const active = allElements.filter((el) => !el.isDeleted);
  const byId = new Map(active.map((el) => [el.id, el]));
  const targets: ElementSnapshot[] = [];
  const seen = new Set<string>();

  for (const id of targetIds) {
    if (seen.has(id)) continue;
    const el = byId.get(id);
    if (el) {
      seen.add(id);
      targets.push(el);
    }
  }

  if (targets.length < 2) {
    throw new BridgeActionError(
      "INVALID_PARAMS",
      `align_elements requires at least 2 existing active elements (found ${targets.length}).`,
    );
  }

  const deltas = new Map<string, { dx: number; dy: number }>();
  for (const el of targets) {
    deltas.set(el.id, { dx: 0, dy: 0 });
  }

  if (alignment === "left") {
    const minX = Math.min(...targets.map((el) => el.x));
    for (const el of targets) {
      deltas.set(el.id, { dx: minX - el.x, dy: 0 });
    }
  } else if (alignment === "right") {
    const maxX = Math.max(...targets.map((el) => el.x + el.width));
    for (const el of targets) {
      deltas.set(el.id, { dx: maxX - (el.x + el.width), dy: 0 });
    }
  } else if (alignment === "center") {
    const minX = Math.min(...targets.map((el) => el.x));
    const maxX = Math.max(...targets.map((el) => el.x + el.width));
    const centerX = (minX + maxX) / 2;
    for (const el of targets) {
      deltas.set(el.id, { dx: centerX - (el.x + el.width / 2), dy: 0 });
    }
  } else if (alignment === "top") {
    const minY = Math.min(...targets.map((el) => el.y));
    for (const el of targets) {
      deltas.set(el.id, { dx: 0, dy: minY - el.y });
    }
  } else if (alignment === "bottom") {
    const maxY = Math.max(...targets.map((el) => el.y + el.height));
    for (const el of targets) {
      deltas.set(el.id, { dx: 0, dy: maxY - (el.y + el.height) });
    }
  } else if (alignment === "middle") {
    const minY = Math.min(...targets.map((el) => el.y));
    const maxY = Math.max(...targets.map((el) => el.y + el.height));
    const centerY = (minY + maxY) / 2;
    for (const el of targets) {
      deltas.set(el.id, { dx: 0, dy: centerY - (el.y + el.height / 2) });
    }
  } else if (alignment === "distribute-horizontal") {
    if (targets.length >= 3) {
      const sorted = [...targets].sort((a, b) => a.x - b.x);
      const leftEdge = sorted[0].x;
      const rightEdge = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width;
      const totalWidth = sorted.reduce((sum, el) => sum + el.width, 0);
      const gap = (rightEdge - leftEdge - totalWidth) / (sorted.length - 1);
      let cursor = leftEdge;
      for (const el of sorted) {
        deltas.set(el.id, { dx: cursor - el.x, dy: 0 });
        cursor += el.width + gap;
      }
    }
  } else if (alignment === "distribute-vertical") {
    if (targets.length >= 3) {
      const sorted = [...targets].sort((a, b) => a.y - b.y);
      const topEdge = sorted[0].y;
      const bottomEdge = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height;
      const totalHeight = sorted.reduce((sum, el) => sum + el.height, 0);
      const gap = (bottomEdge - topEdge - totalHeight) / (sorted.length - 1);
      let cursor = topEdge;
      for (const el of sorted) {
        deltas.set(el.id, { dx: 0, dy: cursor - el.y });
        cursor += el.height + gap;
      }
    }
  }

  const patches: ElementPositionPatch[] = [];
  const patchedIds = new Set<string>();

  for (const el of targets) {
    const delta = deltas.get(el.id)!;
    if (delta.dx !== 0 || delta.dy !== 0) {
      patches.push({ id: el.id, x: el.x + delta.dx, y: el.y + delta.dy });
      patchedIds.add(el.id);
    }
  }

  // Keep bound text elements aligned inside their container shapes
  for (const candidate of active) {
    if (!candidate.containerId || patchedIds.has(candidate.id)) continue;
    const parentDelta = deltas.get(candidate.containerId);
    if (parentDelta && (parentDelta.dx !== 0 || parentDelta.dy !== 0)) {
      patches.push({
        id: candidate.id,
        x: candidate.x + parentDelta.dx,
        y: candidate.y + parentDelta.dy,
      });
      patchedIds.add(candidate.id);
    }
  }

  return {
    alignedIds: targets.map((el) => el.id),
    patches,
  };
}

function computeRestackOrder(
  currentOrder: string[],
  targetIds: string[],
  direction: RestackDirection,
): { restackedIds: string[]; orderedIds: string[] } {
  const targetSet = new Set(targetIds);
  const restackedIds = currentOrder.filter((id) => targetSet.has(id));
  if (restackedIds.length === 0) {
    throw new BridgeActionError("NOT_FOUND", "None of the specified element IDs exist in scene.");
  }

  const next = [...currentOrder];
  if (direction === "front") {
    const rest = next.filter((id) => !targetSet.has(id));
    return { restackedIds, orderedIds: [...rest, ...restackedIds] };
  }

  if (direction === "back") {
    const rest = next.filter((id) => !targetSet.has(id));
    return { restackedIds, orderedIds: [...restackedIds, ...rest] };
  }

  if (direction === "forward") {
    for (let i = next.length - 2; i >= 0; i--) {
      if (targetSet.has(next[i]) && !targetSet.has(next[i + 1])) {
        [next[i], next[i + 1]] = [next[i + 1], next[i]];
      }
    }
    return { restackedIds, orderedIds: next };
  }

  // backward
  for (let i = 1; i < next.length; i++) {
    if (targetSet.has(next[i]) && !targetSet.has(next[i - 1])) {
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
    }
  }
  return { restackedIds, orderedIds: next };
}

export function createBridgeHandlers(adapter: EaAdapter): BridgeHandlerMap {
  return {
    async get_scene_info(input: GetSceneInfoInput): Promise<GetSceneInfoOutput> {
      const scene = await adapter.getSceneElements(input?.filePath, false);
      const typeCounts: Partial<Record<ElementType, number>> = {};
      const frameIds: string[] = [];

      for (const el of scene.elements) {
        typeCounts[el.type] = (typeCounts[el.type] ?? 0) + 1;
        if (el.type === "frame") {
          frameIds.push(el.id);
        }
      }

      return {
        filePath: scene.filePath,
        title: scene.title,
        elementCount: scene.elements.length,
        activeViewType: scene.activeViewType,
        appState: scene.appState,
        bounds: computeSceneBounds(scene.elements),
        typeCounts,
        frameIds,
      };
    },

    async get_elements(input: GetElementsInput): Promise<GetElementsOutput> {
      const scene = await adapter.getSceneElements(
        input?.filePath,
        Boolean(input?.includeDeleted),
      );
      let elements = scene.elements;
      if (Array.isArray(input?.ids)) {
        const idSet = new Set(input.ids);
        elements = elements.filter((el) => idSet.has(el.id));
      }
      return {
        filePath: scene.filePath,
        elements,
        count: elements.length,
      };
    },

    async search_elements(input: SearchElementsInput): Promise<SearchElementsOutput> {
      const scene = await adapter.getSceneElements(
        input?.filePath,
        Boolean(input?.includeDeleted),
      );
      const boundTextById = getBoundTextMap(scene.elements);
      const typeSet =
        Array.isArray(input?.types) && input.types.length > 0 ? new Set(input.types) : null;
      const query = input?.query?.trim().toLowerCase() ?? "";

      const matched = scene.elements.filter((el) => {
        if (typeSet && !typeSet.has(el.type)) return false;
        if (input?.frameId !== undefined && el.frameId !== input.frameId) return false;
        if (input?.groupId !== undefined && !el.groupIds?.includes(input.groupId)) return false;

        if (query.length > 0) {
          const haystack = [
            el.id,
            el.type,
            el.text ?? "",
            el.rawText ?? "",
            boundTextById.get(el.id) ?? "",
            el.customData ? JSON.stringify(el.customData) : "",
          ]
            .join("\n")
            .toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      });

      const limit =
        typeof input?.limit === "number" && input.limit > 0
          ? Math.floor(input.limit)
          : undefined;
      const sliced = limit !== undefined ? matched.slice(0, limit) : matched;

      return {
        filePath: scene.filePath,
        elements: sliced,
        totalMatched: matched.length,
      };
    },

    async get_selected_elements(
      input: GetSelectedElementsInput,
    ): Promise<GetSelectedElementsOutput> {
      const [{ selectedIds }, scene] = await Promise.all([
        adapter.getSelectedElementIds(input?.filePath),
        adapter.getSceneElements(input?.filePath, false),
      ]);
      const idSet = new Set(selectedIds);
      const elements = scene.elements.filter((el) => idSet.has(el.id));
      return {
        filePath: scene.filePath,
        elements,
        selectedIds,
      };
    },

    async set_view(input: SetViewInput): Promise<SetViewOutput> {
      return adapter.setView(input ?? {});
    },

    async create_elements(input: CreateElementsInput): Promise<CreateElementsOutput> {
      if (!input || !Array.isArray(input.elements) || input.elements.length === 0) {
        throw new BridgeActionError(
          "INVALID_PARAMS",
          "create_elements requires a non-empty elements array.",
        );
      }

      const result = await adapter.createElements(input);
      const warnings = analyzeLayout(result.allElements);
      return {
        filePath: result.filePath,
        createdIds: result.createdIds,
        elements: result.createdElements,
        warnings,
      };
    },

    async update_elements(input: UpdateElementsInput): Promise<UpdateElementsOutput> {
      if (!input || !Array.isArray(input.updates) || input.updates.length === 0) {
        throw new BridgeActionError(
          "INVALID_PARAMS",
          "update_elements requires a non-empty updates array.",
        );
      }

      const result = await adapter.updateElements(input);
      const warnings = analyzeLayout(result.allElements);
      return {
        filePath: result.filePath,
        updatedIds: result.updatedIds,
        notFoundIds: result.notFoundIds,
        elements: result.updatedElements,
        warnings,
      };
    },

    async delete_elements(input: DeleteElementsInput): Promise<DeleteElementsOutput> {
      if (!input || !Array.isArray(input.ids) || input.ids.length === 0) {
        throw new BridgeActionError(
          "INVALID_PARAMS",
          "delete_elements requires a non-empty ids array.",
        );
      }

      const result = await adapter.deleteElements(input);
      return {
        filePath: result.filePath,
        deletedIds: result.deletedIds,
        notFoundIds: result.notFoundIds,
      };
    },

    async connect_elements(input: ConnectElementsInput): Promise<ConnectElementsOutput> {
      if (!input?.fromId || !input?.toId) {
        throw new BridgeActionError(
          "INVALID_PARAMS",
          "connect_elements requires both fromId and toId.",
        );
      }

      const result = await adapter.connectElements(input);
      const warnings = analyzeLayout(result.allElements);
      return {
        filePath: result.filePath,
        arrowId: result.arrowId,
        ...(result.labelId ? { labelId: result.labelId } : {}),
        elements: result.createdElements,
        warnings,
      };
    },

    async add_mermaid(input: AddMermaidInput): Promise<AddMermaidOutput> {
      if (!input?.mermaid || typeof input.mermaid !== "string" || !input.mermaid.trim()) {
        throw new BridgeActionError(
          "INVALID_PARAMS",
          "add_mermaid requires a non-empty mermaid diagram string.",
        );
      }

      const result = await adapter.addMermaid(input);
      const warnings = analyzeLayout(result.allElements);
      return {
        filePath: result.filePath,
        createdIds: result.createdIds,
        elements: result.createdElements,
        warnings,
      };
    },

    async align_elements(input: AlignElementsInput): Promise<AlignElementsOutput> {
      if (!input || !Array.isArray(input.ids) || input.ids.length < 2) {
        throw new BridgeActionError(
          "INVALID_PARAMS",
          "align_elements requires ids with at least 2 element IDs.",
        );
      }
      const alignment = normalizeAlignment(String(input.alignment ?? ""));
      const scene = await adapter.getSceneElements(input.filePath, false);
      const { alignedIds, patches } = computeAlignmentPatches(
        scene.elements,
        input.ids,
        alignment,
      );

      if (patches.length === 0) {
        const alignedSet = new Set(alignedIds);
        return {
          filePath: scene.filePath,
          alignedIds,
          elements: scene.elements.filter((el) => alignedSet.has(el.id)),
        };
      }

      const updated = await adapter.applyElementPositions(input.filePath, patches);
      const alignedSet = new Set(alignedIds);
      return {
        filePath: updated.filePath,
        alignedIds,
        elements: updated.allElements.filter((el) => alignedSet.has(el.id)),
      };
    },

    async restack_elements(input: RestackElementsInput): Promise<RestackElementsOutput> {
      if (!input || !Array.isArray(input.ids) || input.ids.length === 0) {
        throw new BridgeActionError(
          "INVALID_PARAMS",
          "restack_elements requires a non-empty ids array.",
        );
      }
      if (!VALID_RESTACK_DIRECTIONS.has(input.direction)) {
        throw new BridgeActionError(
          "INVALID_PARAMS",
          `Invalid restack direction "${String(input.direction)}". Expected front, back, forward, or backward.`,
        );
      }

      const scene = await adapter.getSceneElements(input.filePath, false);
      const currentOrder = scene.elements.map((el) => el.id);
      const { restackedIds, orderedIds } = computeRestackOrder(
        currentOrder,
        input.ids,
        input.direction,
      );

      const res = await adapter.restackElements(input.filePath, orderedIds);
      return {
        filePath: res.filePath,
        restackedIds,
        order: res.order,
      };
    },

    async clear_scene(input: ClearSceneInput): Promise<ClearSceneOutput> {
      if (input?.confirm !== true) {
        throw new BridgeActionError(
          "CONFIRMATION_REQUIRED",
          "clear_scene requires confirm: true to prevent accidental canvas erasure.",
        );
      }
      return adapter.clearScene(input.filePath);
    },

    async check_layout(input: CheckLayoutInput): Promise<CheckLayoutOutput> {
      const scene = await adapter.getSceneElements(input?.filePath, false);
      const allWarnings = analyzeLayout(scene.elements);
      const filterIds =
        Array.isArray(input?.ids) && input.ids.length > 0 ? new Set(input.ids) : null;

      const warnings = filterIds
        ? allWarnings.filter((w) => w.elementIds.some((id) => filterIds.has(id)))
        : allWarnings;

      const elementCount = filterIds
        ? scene.elements.filter((el) => filterIds.has(el.id)).length
        : scene.elements.length;

      return {
        filePath: scene.filePath,
        elementCount,
        warningCount: warnings.filter((w) => w.severity === "warning").length,
        errorCount: warnings.filter((w) => w.severity === "error").length,
        warnings,
      };
    },

    async export_image(input: ExtendedExportImageInput): Promise<ExportImageOutput> {
      if (!input || (input.format !== "png" && input.format !== "svg")) {
        throw new BridgeActionError(
          "INVALID_PARAMS",
          'export_image requires format to be "png" or "svg".',
        );
      }

      const savePath = input.outputPath ?? input.saveToVaultPath;
      if (savePath !== undefined) {
        const validation = validateVaultRelativePath(savePath);
        if (!validation.ok) {
          throw new BridgeActionError("INVALID_PATH", validation.error);
        }
      }

      return adapter.exportImage(input);
    },
  };
}
