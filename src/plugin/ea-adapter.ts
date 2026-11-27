import type { App, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import { validateVaultRelativePath } from "../shared/protocol.ts";
import type {
  AddMermaidInput,
  AnchorSide,
  BoundElementRef,
  ConnectElementsInput,
  CreateElementsInput,
  DeleteElementsInput,
  ElementBinding,
  ElementCreateSpec,
  ElementSnapshot,
  ElementStyle,
  ElementType,
  ElementUpdatePatch,
  ExportImageInput,
  ExportImageOutput,
  GetSceneInfoOutput,
  SetViewInput,
  SetViewOutput,
  UpdateElementsInput,
} from "../shared/types.ts";

export interface SceneReadResult {
  filePath: string;
  title: string;
  activeViewType?: string;
  appState?: GetSceneInfoOutput["appState"];
  elements: ElementSnapshot[];
}

export interface ElementPositionPatch {
  id: string;
  x: number;
  y: number;
}

export interface ExtendedExportImageInput extends ExportImageInput {
  includeBoundElements?: boolean;
  saveToVaultPath?: string;
}

export interface EaAdapter {
  isAvailable(): boolean;
  getActiveFilePath(): string | null;
  getSceneElements(filePath?: string, includeDeleted?: boolean): Promise<SceneReadResult>;
  getSelectedElementIds(filePath?: string): Promise<{ filePath: string; selectedIds: string[] }>;
  setView(input: SetViewInput): Promise<SetViewOutput>;
  createElements(input: CreateElementsInput): Promise<{
    filePath: string;
    createdIds: string[];
    createdElements: ElementSnapshot[];
    allElements: ElementSnapshot[];
  }>;
  updateElements(input: UpdateElementsInput): Promise<{
    filePath: string;
    updatedIds: string[];
    notFoundIds: string[];
    updatedElements: ElementSnapshot[];
    allElements: ElementSnapshot[];
  }>;
  deleteElements(input: DeleteElementsInput): Promise<{
    filePath: string;
    deletedIds: string[];
    notFoundIds: string[];
    allElements: ElementSnapshot[];
  }>;
  connectElements(input: ConnectElementsInput): Promise<{
    filePath: string;
    arrowId: string;
    labelId?: string;
    createdElements: ElementSnapshot[];
    allElements: ElementSnapshot[];
  }>;
  addMermaid(input: AddMermaidInput): Promise<{
    filePath: string;
    createdIds: string[];
    createdElements: ElementSnapshot[];
    allElements: ElementSnapshot[];
  }>;
  applyElementPositions(
    filePath: string | undefined,
    patches: ElementPositionPatch[],
  ): Promise<{
    filePath: string;
    updatedElements: ElementSnapshot[];
    allElements: ElementSnapshot[];
  }>;
  restackElements(
    filePath: string | undefined,
    orderedIds: string[],
  ): Promise<{
    filePath: string;
    order: string[];
    allElements: ElementSnapshot[];
  }>;
  clearScene(filePath?: string): Promise<{
    filePath: string;
    clearedCount: number;
  }>;
  exportImage(input: ExtendedExportImageInput): Promise<ExportImageOutput>;
}

export class EaAdapterError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "EaAdapterError";
    this.code = code;
  }
}

interface RawExcalidrawElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  text?: string;
  rawText?: string;
  originalText?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  groupIds?: string[];
  frameId?: string | null;
  boundElements?: BoundElementRef[] | null;
  containerId?: string | null;
  startBinding?: ElementBinding | null;
  endBinding?: ElementBinding | null;
  points?: [number, number][];
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  opacity?: number;
  roundness?: { type: number; value?: number } | null;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  startArrowHead?: string | null;
  endArrowHead?: string | null;
  isDeleted?: boolean;
  customData?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ExcalidrawAppState {
  viewBackgroundColor?: string;
  gridSize?: number | null;
  theme?: string;
  scrollX?: number;
  scrollY?: number;
  zoom?: { value?: number } | number;
}

interface ExcalidrawImperativeApi {
  getAppState?(): ExcalidrawAppState;
  updateScene?(sceneData: {
    elements?: RawExcalidrawElement[];
    appState?: Record<string, unknown>;
  }): void;
  scrollToContent?(
    target?: RawExcalidrawElement | RawExcalidrawElement[],
    opts?: { fitToViewport?: boolean; viewportZoomFactor?: number },
  ): void;
  bringToFront?(elements: RawExcalidrawElement[]): void;
  sendToBack?(elements: RawExcalidrawElement[]): void;
}

interface ExcalidrawViewLike {
  file?: TFile | null;
  getViewType?(): string;
  updateScene?(scene: { elements?: RawExcalidrawElement[] }): void;
  excalidrawAPI?: ExcalidrawImperativeApi;
}

interface ExcalidrawAutomateApi {
  targetView: ExcalidrawViewLike | null;
  style: Record<string, unknown>;
  canvas: { theme?: string; viewBackgroundColor?: string };
  setView(view?: unknown, show?: boolean): ExcalidrawViewLike | null;
  clear(): void;
  reset(): void;
  getViewElements(): RawExcalidrawElement[];
  getViewSelectedElements(includeFrameChildren?: boolean): RawExcalidrawElement[];
  copyViewElementsToEAforEditing(elements: RawExcalidrawElement[], copyImages?: boolean): void;
  getElement(id: string): RawExcalidrawElement | undefined;
  getElements(): RawExcalidrawElement[];
  addElementsToView(
    repositionToCursor?: boolean,
    save?: boolean,
    newElementsOnTop?: boolean,
    shouldRestoreElements?: boolean,
  ): Promise<boolean>;
  deleteViewElements(elements: RawExcalidrawElement[]): boolean;
  selectElementsInView(elements: RawExcalidrawElement[] | string[]): void;
  viewZoomToElements(
    selectElements: boolean,
    elements: RawExcalidrawElement[],
    margin?: number,
  ): void;
  addRect(x: number, y: number, w: number, h: number, id?: string): string;
  addEllipse(x: number, y: number, w: number, h: number, id?: string): string;
  addDiamond(x: number, y: number, w: number, h: number, id?: string): string;
  addText(
    x: number,
    y: number,
    text: string,
    formatting?: Record<string, unknown>,
    id?: string,
  ): string;
  addLine(points: [number, number][], id?: string): string;
  addArrow(
    points: [number, number][],
    formatting?: Record<string, unknown>,
    id?: string,
  ): string;
  addFrame(x: number, y: number, w: number, h: number, name?: string): string;
  addMermaid(diagram: string, groupElements?: boolean): Promise<string[] | string>;
  moveViewElementToZIndex(elementId: string, newZIndex: number): void;
  createPNG(
    templatePath?: string,
    scale?: number,
    exportSettings?: unknown,
    loader?: unknown,
    theme?: string,
    padding?: number,
  ): Promise<unknown>;
  createSVG(
    templatePath?: string,
    embedFont?: boolean,
    exportSettings?: unknown,
    loader?: unknown,
    theme?: string,
    padding?: number,
    convertMarkdownLinksToObsidianURLs?: boolean,
    includeInternalLinks?: boolean,
  ): Promise<SVGSVGElement>;
  getExportSettings(withBackground: boolean, withTheme: boolean): unknown;
  getEmbeddedFilesLoader(isDark?: boolean): unknown;
  checkAndCreateFolder(folderPath: string): Promise<unknown>;
  getExcalidrawAPI(): ExcalidrawImperativeApi | null;
}

export function mapRawElementToSnapshot(el: RawExcalidrawElement): ElementSnapshot {
  const snap: ElementSnapshot = {
    id: el.id,
    type: el.type,
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
  };

  if (el.angle !== undefined) snap.angle = el.angle;
  if (el.text !== undefined) snap.text = el.text;
  if (el.rawText !== undefined) snap.rawText = el.rawText;
  if (el.fontSize !== undefined) snap.fontSize = el.fontSize;
  if (el.fontFamily !== undefined) snap.fontFamily = el.fontFamily;
  if (el.textAlign !== undefined) snap.textAlign = el.textAlign;
  if (el.verticalAlign !== undefined) snap.verticalAlign = el.verticalAlign;
  if (el.groupIds !== undefined) snap.groupIds = [...el.groupIds];
  if (el.frameId !== undefined) snap.frameId = el.frameId;
  if (el.boundElements !== undefined) {
    snap.boundElements = el.boundElements
      ? el.boundElements.map((ref) => ({ id: ref.id, type: ref.type }))
      : null;
  }
  if (el.containerId !== undefined) snap.containerId = el.containerId;
  if (el.startBinding !== undefined) {
    snap.startBinding = el.startBinding ? { ...el.startBinding } : null;
  }
  if (el.endBinding !== undefined) {
    snap.endBinding = el.endBinding ? { ...el.endBinding } : null;
  }
  if (el.points !== undefined) {
    snap.points = el.points.map(([px, py]) => [px, py]);
  }
  if (el.strokeColor !== undefined) snap.strokeColor = el.strokeColor;
  if (el.backgroundColor !== undefined) snap.backgroundColor = el.backgroundColor;
  if (el.fillStyle !== undefined) snap.fillStyle = el.fillStyle;
  if (el.strokeWidth !== undefined) snap.strokeWidth = el.strokeWidth;
  if (el.strokeStyle !== undefined) snap.strokeStyle = el.strokeStyle;
  if (el.roughness !== undefined) snap.roughness = el.roughness;
  if (el.opacity !== undefined) snap.opacity = el.opacity;
  if (el.roundness !== undefined) {
    snap.roundness = el.roundness ? { ...el.roundness } : null;
  }
  const startHead = el.startArrowHead ?? el.startArrowhead;
  if (startHead !== undefined) snap.startArrowHead = startHead;
  const endHead = el.endArrowHead ?? el.endArrowhead;
  if (endHead !== undefined) snap.endArrowHead = endHead;
  if (el.isDeleted !== undefined) snap.isDeleted = el.isDeleted;
  if (el.customData !== undefined) snap.customData = { ...el.customData };

  return snap;
}

/**
 * Computes the transitive closure of elements connected to `seedIds` via
 * `boundElements`, `containerId`, and frame children (`frameId`).
 */
export function collectBoundElementClosure(
  elements: ElementSnapshot[],
  seedIds: Iterable<string>,
): Set<string> {
  const byId = new Map<string, ElementSnapshot>();
  for (const el of elements) {
    if (!el.isDeleted) {
      byId.set(el.id, el);
    }
  }

  const visited = new Set<string>();
  const queue: string[] = [];

  for (const id of seedIds) {
    if (byId.has(id) && !visited.has(id)) {
      visited.add(id);
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const current = byId.get(currentId);
    if (!current) continue;

    if (current.boundElements) {
      for (const ref of current.boundElements) {
        if (byId.has(ref.id) && !visited.has(ref.id)) {
          visited.add(ref.id);
          queue.push(ref.id);
        }
      }
    }

    for (const candidate of byId.values()) {
      if (visited.has(candidate.id)) continue;
      if (candidate.containerId === currentId) {
        visited.add(candidate.id);
        queue.push(candidate.id);
      } else if (current.type === "frame" && candidate.frameId === currentId) {
        visited.add(candidate.id);
        queue.push(candidate.id);
      }
    }
  }

  return visited;
}

function getZoomValue(appState: ExcalidrawAppState | undefined): number | undefined {
  if (!appState || appState.zoom === undefined) return undefined;
  return typeof appState.zoom === "number" ? appState.zoom : appState.zoom.value;
}

function sideToFixedPoint(side: AnchorSide | undefined): [number, number] | undefined {
  switch (side) {
    case "left":
      return [0, 0.5];
    case "right":
      return [1, 0.5];
    case "top":
      return [0.5, 0];
    case "bottom":
      return [0.5, 1];
    case "center":
      return [0.5, 0.5];
    default:
      return undefined;
  }
}

function resolveAutoSides(
  fromEl: RawExcalidrawElement,
  toEl: RawExcalidrawElement,
): { startSide: AnchorSide; endSide: AnchorSide } {
  const fromCx = fromEl.x + fromEl.width / 2;
  const fromCy = fromEl.y + fromEl.height / 2;
  const toCx = toEl.x + toEl.width / 2;
  const toCy = toEl.y + toEl.height / 2;
  const dx = toCx - fromCx;
  const dy = toCy - fromCy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { startSide: "right", endSide: "left" }
      : { startSide: "left", endSide: "right" };
  }
  return dy >= 0
    ? { startSide: "bottom", endSide: "top" }
    : { startSide: "top", endSide: "bottom" };
}

function getSidePoint(
  el: RawExcalidrawElement,
  side: AnchorSide,
  pad = 4,
): [number, number] {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  switch (side) {
    case "left":
      return [el.x - pad, cy];
    case "right":
      return [el.x + el.width + pad, cy];
    case "top":
      return [cx, el.y - pad];
    case "bottom":
      return [cx, el.y + el.height + pad];
    default:
      return [cx, cy];
  }
}

function isTFile(file: TAbstractFile | null): file is TFile {
  return Boolean(file && "extension" in file && !("children" in file));
}

function resetEaStyle(ea: ExcalidrawAutomateApi): void {
  Object.assign(ea.style, {
    strokeColor: "#000000",
    backgroundColor: "transparent",
    angle: 0,
    fillStyle: "hachure",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    roundness: null,
    fontFamily: 1,
    fontSize: 20,
    textAlign: "left",
    verticalAlign: "top",
    startArrowHead: null,
    endArrowHead: "arrow",
  });
}

function applyStyleToEa(ea: ExcalidrawAutomateApi, style: ElementStyle): void {
  if (style.strokeColor !== undefined) ea.style.strokeColor = style.strokeColor;
  if (style.backgroundColor !== undefined) ea.style.backgroundColor = style.backgroundColor;
  if (style.fillStyle !== undefined) ea.style.fillStyle = style.fillStyle;
  if (style.strokeWidth !== undefined) ea.style.strokeWidth = style.strokeWidth;
  if (style.strokeStyle !== undefined) ea.style.strokeStyle = style.strokeStyle;
  if (style.roughness !== undefined) ea.style.roughness = style.roughness;
  if (style.opacity !== undefined) ea.style.opacity = style.opacity;
  if (style.fontFamily !== undefined) ea.style.fontFamily = style.fontFamily;
  if (style.fontSize !== undefined) ea.style.fontSize = style.fontSize;
  if (style.angle !== undefined) ea.style.angle = style.angle;
}

function mergeSpecStyle(spec: { style?: ElementStyle } & ElementStyle): ElementStyle {
  return {
    ...(spec.style ?? {}),
    ...(spec.strokeColor !== undefined ? { strokeColor: spec.strokeColor } : {}),
    ...(spec.backgroundColor !== undefined ? { backgroundColor: spec.backgroundColor } : {}),
    ...(spec.fillStyle !== undefined ? { fillStyle: spec.fillStyle } : {}),
    ...(spec.strokeWidth !== undefined ? { strokeWidth: spec.strokeWidth } : {}),
    ...(spec.strokeStyle !== undefined ? { strokeStyle: spec.strokeStyle } : {}),
    ...(spec.roughness !== undefined ? { roughness: spec.roughness } : {}),
    ...(spec.opacity !== undefined ? { opacity: spec.opacity } : {}),
    ...(spec.roundness !== undefined ? { roundness: spec.roundness } : {}),
    ...(spec.fontFamily !== undefined ? { fontFamily: spec.fontFamily } : {}),
    ...(spec.fontSize !== undefined ? { fontSize: spec.fontSize } : {}),
    ...(spec.textAlign !== undefined ? { textAlign: spec.textAlign } : {}),
    ...(spec.verticalAlign !== undefined ? { verticalAlign: spec.verticalAlign } : {}),
    ...(spec.startArrowHead !== undefined ? { startArrowHead: spec.startArrowHead } : {}),
    ...(spec.endArrowHead !== undefined ? { endArrowHead: spec.endArrowHead } : {}),
    ...(spec.angle !== undefined ? { angle: spec.angle } : {}),
  };
}

function applyDirectElementFields(
  el: RawExcalidrawElement,
  style: ElementStyle,
  extra: {
    frameId?: string | null;
    groupIds?: string[];
    containerId?: string | null;
    startBinding?: ElementBinding | null;
    endBinding?: ElementBinding | null;
    customData?: Record<string, unknown>;
  },
): void {
  if (style.strokeColor !== undefined) el.strokeColor = style.strokeColor;
  if (style.backgroundColor !== undefined) el.backgroundColor = style.backgroundColor;
  if (style.fillStyle !== undefined) el.fillStyle = style.fillStyle;
  if (style.strokeWidth !== undefined) el.strokeWidth = style.strokeWidth;
  if (style.strokeStyle !== undefined) el.strokeStyle = style.strokeStyle;
  if (style.roughness !== undefined) el.roughness = style.roughness;
  if (style.opacity !== undefined) el.opacity = style.opacity;
  if (style.roundness !== undefined) el.roundness = style.roundness;
  if (style.fontFamily !== undefined) el.fontFamily = style.fontFamily;
  if (style.fontSize !== undefined) el.fontSize = style.fontSize;
  if (style.textAlign !== undefined) el.textAlign = style.textAlign;
  if (style.verticalAlign !== undefined) el.verticalAlign = style.verticalAlign;
  if (style.angle !== undefined) el.angle = style.angle;
  if (style.startArrowHead !== undefined) el.startArrowhead = style.startArrowHead;
  if (style.endArrowHead !== undefined) el.endArrowhead = style.endArrowHead;

  if (extra.frameId !== undefined) el.frameId = extra.frameId;
  if (extra.groupIds !== undefined) el.groupIds = [...extra.groupIds];
  if (extra.containerId !== undefined) el.containerId = extra.containerId;
  if (extra.startBinding !== undefined) el.startBinding = extra.startBinding;
  if (extra.endBinding !== undefined) el.endBinding = extra.endBinding;
  if (extra.customData !== undefined) el.customData = { ...extra.customData };
}

export class ObsidianEaAdapter implements EaAdapter {
  private readonly app: App;
  private readonly getDefaultViewTarget: () => "active" | "first";
  private readonly getEaOverride?: () => ExcalidrawAutomateApi | null;

  constructor(
    app: App,
    getDefaultViewTarget: () => "active" | "first" = () => "active",
    getEa?: () => ExcalidrawAutomateApi | null,
  ) {
    this.app = app;
    this.getDefaultViewTarget = getDefaultViewTarget;
    this.getEaOverride = getEa;
  }

  private getEa(): ExcalidrawAutomateApi | null {
    if (this.getEaOverride) {
      return this.getEaOverride();
    }
    const win = window as unknown as { ExcalidrawAutomate?: ExcalidrawAutomateApi };
    return win.ExcalidrawAutomate ?? null;
  }

  isAvailable(): boolean {
    return this.getEa() !== null;
  }

  getActiveFilePath(): string | null {
    const ea = this.getEa();
    if (!ea) return null;
    try {
      const view = ea.setView(this.getDefaultViewTarget());
      if (view?.file?.path) return view.file.path;
      const leaves = this.app.workspace.getLeavesOfType("excalidraw");
      const firstView = leaves[0]?.view as ExcalidrawViewLike | undefined;
      return firstView?.file?.path ?? null;
    } catch {
      return null;
    }
  }

  private resolveView(filePath?: string): {
    ea: ExcalidrawAutomateApi;
    view: ExcalidrawViewLike;
    filePath: string;
    title: string;
  } {
    const ea = this.getEa();
    if (!ea) {
      throw new EaAdapterError(
        "EXCALIDRAW_UNAVAILABLE",
        "Excalidraw plugin is not loaded (window.ExcalidrawAutomate is missing). Enable the Excalidraw community plugin first.",
      );
    }

    const leaves: WorkspaceLeaf[] = this.app.workspace.getLeavesOfType("excalidraw");
    let view: ExcalidrawViewLike | null = null;

    if (filePath !== undefined) {
      const validation = validateVaultRelativePath(filePath);
      if (!validation.ok) {
        throw new EaAdapterError("INVALID_PATH", validation.error);
      }
      const matchingLeaf = leaves.find((leaf) => {
        const candidate = leaf.view as ExcalidrawViewLike | undefined;
        return candidate?.file?.path === validation.path;
      });
      if (!matchingLeaf) {
        throw new EaAdapterError(
          "VIEW_NOT_FOUND",
          `No open Excalidraw view found for "${validation.path}". Open that drawing in Obsidian first.`,
        );
      }
      view = ea.setView(matchingLeaf.view);
    } else {
      const preferredMode = this.getDefaultViewTarget();
      view = ea.setView(preferredMode);
      if (!view && leaves.length > 0) {
        view = ea.setView(leaves[0].view);
      }
    }

    if (!view) {
      throw new EaAdapterError(
        "NO_ACTIVE_VIEW",
        "No open Excalidraw drawing found. Open an .excalidraw or .excalidraw.md note in Obsidian first.",
      );
    }

    const resolvedPath = view.file?.path ?? "untitled.excalidraw";
    const title = view.file?.basename ?? resolvedPath;
    return { ea, view, filePath: resolvedPath, title };
  }

  private readAllSnapshots(ea: ExcalidrawAutomateApi, includeDeleted = false): ElementSnapshot[] {
    const raw = ea.getViewElements() ?? [];
    const filtered = includeDeleted ? raw : raw.filter((el) => !el.isDeleted);
    return filtered.map(mapRawElementToSnapshot);
  }

  async getSceneElements(filePath?: string, includeDeleted = false): Promise<SceneReadResult> {
    const { ea, view, filePath: resolvedPath, title } = this.resolveView(filePath);
    const api = ea.getExcalidrawAPI?.() ?? view.excalidrawAPI;
    const rawAppState = api?.getAppState?.();
    const elements = this.readAllSnapshots(ea, includeDeleted);

    return {
      filePath: resolvedPath,
      title,
      activeViewType: view.getViewType?.() ?? "excalidraw",
      appState: rawAppState
        ? {
            viewBackgroundColor: rawAppState.viewBackgroundColor,
            gridSize: rawAppState.gridSize,
            theme: rawAppState.theme,
            scrollX: rawAppState.scrollX,
            scrollY: rawAppState.scrollY,
            zoom: getZoomValue(rawAppState),
          }
        : undefined,
      elements,
    };
  }

  async getSelectedElementIds(
    filePath?: string,
  ): Promise<{ filePath: string; selectedIds: string[] }> {
    const { ea, filePath: resolvedPath } = this.resolveView(filePath);
    const selected = ea.getViewSelectedElements?.(true) ?? [];
    return {
      filePath: resolvedPath,
      selectedIds: selected.filter((el) => !el.isDeleted).map((el) => el.id),
    };
  }

  async setView(input: SetViewInput): Promise<SetViewOutput> {
    const { ea, view, filePath } = this.resolveView(input.filePath);
    const api = ea.getExcalidrawAPI?.() ?? view.excalidrawAPI;
    const allRaw = (ea.getViewElements() ?? []).filter((el) => !el.isDeleted);

    let focusedElementIds: string[] | undefined;
    if (input.targetElementIds && input.targetElementIds.length > 0) {
      const targetSet = new Set(input.targetElementIds);
      const targets = allRaw.filter((el) => targetSet.has(el.id));
      if (targets.length === 0) {
        throw new EaAdapterError(
          "NOT_FOUND",
          `None of the targetElementIds exist in "${filePath}".`,
        );
      }
      focusedElementIds = targets.map((el) => el.id);
      const margin = typeof input.padding === "number" ? Math.max(0.01, input.padding / 500) : 0.08;
      if (typeof ea.viewZoomToElements === "function") {
        ea.viewZoomToElements(false, targets, margin);
      } else if (api?.scrollToContent) {
        api.scrollToContent(targets, { fitToViewport: true });
      }
    } else if (input.scrollToContent) {
      if (typeof ea.viewZoomToElements === "function") {
        ea.viewZoomToElements(false, allRaw, 0.08);
      } else if (api?.scrollToContent) {
        api.scrollToContent(allRaw, { fitToViewport: true });
      }
    }

    if (
      api?.updateScene &&
      (input.zoom !== undefined || input.scrollX !== undefined || input.scrollY !== undefined)
    ) {
      const appStatePatch: Record<string, unknown> = {};
      if (input.zoom !== undefined) {
        appStatePatch.zoom = { value: input.zoom };
      }
      if (input.scrollX !== undefined) {
        appStatePatch.scrollX = input.scrollX;
      }
      if (input.scrollY !== undefined) {
        appStatePatch.scrollY = input.scrollY;
      }
      api.updateScene({ appState: appStatePatch });
    }

    const afterState = api?.getAppState?.();
    return {
      filePath,
      scrollX: afterState?.scrollX ?? input.scrollX ?? 0,
      scrollY: afterState?.scrollY ?? input.scrollY ?? 0,
      zoom: getZoomValue(afterState) ?? input.zoom ?? 1,
      ...(focusedElementIds ? { focusedElementIds } : {}),
    };
  }

  private createSingleElementInEa(
    ea: ExcalidrawAutomateApi,
    spec: ElementCreateSpec,
  ): string[] {
    const mergedStyle = mergeSpecStyle(spec);
    applyStyleToEa(ea, mergedStyle);

    const width = spec.width ?? (spec.type === "text" ? undefined : 160);
    const height = spec.height ?? (spec.type === "text" ? undefined : 80);
    const createdIds: string[] = [];

    let primaryId: string;
    switch (spec.type) {
      case "rectangle":
        primaryId = ea.addRect(spec.x, spec.y, width ?? 160, height ?? 80, spec.id);
        break;
      case "ellipse":
        primaryId = ea.addEllipse(spec.x, spec.y, width ?? 160, height ?? 80, spec.id);
        break;
      case "diamond":
        primaryId = ea.addDiamond(spec.x, spec.y, width ?? 160, height ?? 80, spec.id);
        break;
      case "frame": {
        primaryId = ea.addFrame(
          spec.x,
          spec.y,
          width ?? 400,
          height ?? 300,
          spec.label?.text ?? spec.text,
        );
        break;
      }
      case "text": {
        const textValue = spec.text ?? spec.label?.text ?? "";
        const formatting: Record<string, unknown> = {
          textAlign: mergedStyle.textAlign ?? "left",
          textVerticalAlign: mergedStyle.verticalAlign ?? "top",
        };
        if (width !== undefined) formatting.width = width;
        if (height !== undefined) formatting.height = height;
        primaryId = ea.addText(spec.x, spec.y, textValue, formatting, spec.id);
        break;
      }
      case "line": {
        const pts: [number, number][] =
          spec.points && spec.points.length >= 2
            ? spec.points.map(([px, py]) => [spec.x + px, spec.y + py])
            : [
                [spec.x, spec.y],
                [spec.x + (width ?? 100), spec.y + (height ?? 0)],
              ];
        primaryId = ea.addLine(pts, spec.id);
        break;
      }
      case "arrow": {
        const pts: [number, number][] =
          spec.points && spec.points.length >= 2
            ? spec.points.map(([px, py]) => [spec.x + px, spec.y + py])
            : [
                [spec.x, spec.y],
                [spec.x + (width ?? 120), spec.y + (height ?? 0)],
              ];
        const fmt: Record<string, unknown> = {
          startArrowHead: mergedStyle.startArrowHead ?? null,
          endArrowHead: mergedStyle.endArrowHead ?? "arrow",
        };
        if (spec.startBinding?.elementId) fmt.startObjectId = spec.startBinding.elementId;
        if (spec.endBinding?.elementId) fmt.endObjectId = spec.endBinding.elementId;
        primaryId = ea.addArrow(pts, fmt, spec.id);
        break;
      }
      default:
        throw new EaAdapterError(
          "UNSUPPORTED_ELEMENT_TYPE",
          `Element type "${spec.type}" cannot be created via ExcalidrawAutomate.`,
        );
    }

    const primaryEl = ea.getElement(primaryId);
    if (primaryEl) {
      applyDirectElementFields(primaryEl, mergedStyle, {
        frameId: spec.frameId,
        groupIds: spec.groupIds,
        containerId: spec.containerId,
        startBinding: spec.startBinding,
        endBinding: spec.endBinding,
        customData: spec.customData,
      });
    }
    createdIds.push(primaryId);

    const containerLabelText =
      spec.type === "rectangle" || spec.type === "ellipse" || spec.type === "diamond"
        ? (spec.label?.text ?? spec.text)
        : undefined;

    if (containerLabelText !== undefined && containerLabelText.length > 0 && primaryEl) {
      const labelFontSize = spec.label?.fontSize ?? mergedStyle.fontSize ?? 20;
      const labelFontFamily = spec.label?.fontFamily ?? mergedStyle.fontFamily;
      const labelStroke = spec.label?.strokeColor ?? mergedStyle.strokeColor;
      const labelAlign = spec.label?.textAlign ?? "center";
      const labelVAlign = spec.label?.verticalAlign ?? "middle";

      ea.style.fontSize = labelFontSize;
      if (labelFontFamily !== undefined) ea.style.fontFamily = labelFontFamily;
      if (labelStroke !== undefined) ea.style.strokeColor = labelStroke;

      const textId = ea.addText(spec.x, spec.y, containerLabelText, {
        textAlign: labelAlign,
        textVerticalAlign: labelVAlign,
        width: primaryEl.width,
        height: primaryEl.height,
      });
      const textEl = ea.getElement(textId);
      if (textEl) {
        textEl.containerId = primaryId;
        textEl.textAlign = labelAlign;
        textEl.verticalAlign = labelVAlign;
        if (spec.frameId !== undefined) textEl.frameId = spec.frameId;
      }
      primaryEl.boundElements = [
        ...(primaryEl.boundElements ?? []),
        { id: textId, type: "text" },
      ];
      createdIds.push(textId);
    }

    return createdIds;
  }

  async createElements(input: CreateElementsInput): Promise<{
    filePath: string;
    createdIds: string[];
    createdElements: ElementSnapshot[];
    allElements: ElementSnapshot[];
  }> {
    const { ea, filePath } = this.resolveView(input.filePath);
    ea.reset();

    const createdIds: string[] = [];
    try {
      for (const spec of input.elements) {
        resetEaStyle(ea);
        const ids = this.createSingleElementInEa(ea, spec);
        createdIds.push(...ids);
      }

      const committed = await ea.addElementsToView(false, true, true);
      if (!committed) {
        throw new EaAdapterError("COMMIT_FAILED", "Failed to add elements to Excalidraw view.");
      }

      if (input.selectCreated && createdIds.length > 0) {
        ea.selectElementsInView(createdIds);
      }
      if (input.scrollToCreated && createdIds.length > 0) {
        const rawCreated = (ea.getViewElements() ?? []).filter((el) =>
          createdIds.includes(el.id),
        );
        if (rawCreated.length > 0) {
          ea.viewZoomToElements(Boolean(input.selectCreated), rawCreated, 0.08);
        }
      }

      const allElements = this.readAllSnapshots(ea, false);
      const createdSet = new Set(createdIds);
      const createdElements = allElements.filter((el) => createdSet.has(el.id));
      return { filePath, createdIds, createdElements, allElements };
    } finally {
      ea.clear();
    }
  }

  async updateElements(input: UpdateElementsInput): Promise<{
    filePath: string;
    updatedIds: string[];
    notFoundIds: string[];
    updatedElements: ElementSnapshot[];
    allElements: ElementSnapshot[];
  }> {
    const { ea, filePath } = this.resolveView(input.filePath);
    ea.clear();
    resetEaStyle(ea);

    try {
      const viewElements = (ea.getViewElements() ?? []).filter((el) => !el.isDeleted);
      if (viewElements.length > 0) {
        ea.copyViewElementsToEAforEditing(viewElements);
      }

      const updatedIds: string[] = [];
      const notFoundIds: string[] = [];

      for (const patch of input.updates) {
        const el = ea.getElement(patch.id);
        if (!el) {
          notFoundIds.push(patch.id);
          continue;
        }

        const prevX = el.x;
        const prevY = el.y;
        const prevW = el.width;
        const prevH = el.height;

        if (patch.x !== undefined) el.x = patch.x;
        if (patch.y !== undefined) el.y = patch.y;
        if (patch.width !== undefined) el.width = patch.width;
        if (patch.height !== undefined) el.height = patch.height;
        if (patch.points !== undefined) {
          el.points = patch.points.map(([px, py]) => [px, py]);
        }
        if (patch.isDeleted !== undefined) el.isDeleted = patch.isDeleted;

        const mergedStyle = mergeSpecStyle(patch);
        applyDirectElementFields(el, mergedStyle, {
          frameId: patch.frameId,
          groupIds: patch.groupIds,
          containerId: patch.containerId,
          startBinding: patch.startBinding,
          endBinding: patch.endBinding,
          customData: patch.customData,
        });

        // Keep bound text shifted if shape moved
        const dx = el.x - prevX;
        const dy = el.y - prevY;
        const dw = el.width - prevW;
        const dh = el.height - prevH;
        if ((dx !== 0 || dy !== 0 || dw !== 0 || dh !== 0) && el.boundElements) {
          for (const ref of el.boundElements) {
            if (ref.type === "text") {
              const boundText = ea.getElement(ref.id);
              if (boundText) {
                boundText.x += dx + dw / 2;
                boundText.y += dy + dh / 2;
              }
            }
          }
        }

        if (patch.text !== undefined) {
          if (el.type === "text") {
            el.text = patch.text;
            el.rawText = patch.text;
            el.originalText = patch.text;
          } else {
            const textRef = el.boundElements?.find((ref) => ref.type === "text");
            const boundText = textRef ? ea.getElement(textRef.id) : undefined;
            if (boundText) {
              boundText.text = patch.text;
              boundText.rawText = patch.text;
              boundText.originalText = patch.text;
              if (mergedStyle.fontSize !== undefined) boundText.fontSize = mergedStyle.fontSize;
              if (mergedStyle.fontFamily !== undefined) {
                boundText.fontFamily = mergedStyle.fontFamily;
              }
            } else {
              resetEaStyle(ea);
              ea.style.fontSize = mergedStyle.fontSize ?? 20;
              if (mergedStyle.strokeColor !== undefined) {
                ea.style.strokeColor = mergedStyle.strokeColor;
              }
              const newTextId = ea.addText(el.x, el.y, patch.text, {
                textAlign: mergedStyle.textAlign ?? "center",
                textVerticalAlign: mergedStyle.verticalAlign ?? "middle",
                width: el.width,
                height: el.height,
              });
              const newTextEl = ea.getElement(newTextId);
              if (newTextEl) {
                newTextEl.containerId = el.id;
                newTextEl.textAlign = mergedStyle.textAlign ?? "center";
                newTextEl.verticalAlign = mergedStyle.verticalAlign ?? "middle";
              }
              el.boundElements = [...(el.boundElements ?? []), { id: newTextId, type: "text" }];
            }
          }
        }

        updatedIds.push(patch.id);
      }

      if (updatedIds.length > 0) {
        await ea.addElementsToView(false, true, false);
      }

      const allElements = this.readAllSnapshots(ea, false);
      const updatedSet = new Set(updatedIds);
      const updatedElements = allElements.filter((el) => updatedSet.has(el.id));
      return { filePath, updatedIds, notFoundIds, updatedElements, allElements };
    } finally {
      ea.clear();
    }
  }

  async deleteElements(input: DeleteElementsInput): Promise<{
    filePath: string;
    deletedIds: string[];
    notFoundIds: string[];
    allElements: ElementSnapshot[];
  }> {
    const { ea, filePath } = this.resolveView(input.filePath);
    const rawElements = (ea.getViewElements() ?? []).filter((el) => !el.isDeleted);
    const byId = new Map(rawElements.map((el) => [el.id, el]));

    const notFoundIds: string[] = [];
    const seedIds: string[] = [];
    for (const id of input.ids) {
      if (byId.has(id)) {
        seedIds.push(id);
      } else {
        notFoundIds.push(id);
      }
    }

    let deleteSet: Set<string>;
    if (input.deleteBoundElements) {
      const snapshots = rawElements.map(mapRawElementToSnapshot);
      deleteSet = collectBoundElementClosure(snapshots, seedIds);
    } else {
      deleteSet = new Set(seedIds);
    }

    const toDelete = rawElements.filter((el) => deleteSet.has(el.id));
    if (toDelete.length > 0) {
      ea.deleteViewElements(toDelete);
    }

    const allElements = this.readAllSnapshots(ea, false);
    return {
      filePath,
      deletedIds: toDelete.map((el) => el.id),
      notFoundIds,
      allElements,
    };
  }

  async connectElements(input: ConnectElementsInput): Promise<{
    filePath: string;
    arrowId: string;
    labelId?: string;
    createdElements: ElementSnapshot[];
    allElements: ElementSnapshot[];
  }> {
    const { ea, filePath } = this.resolveView(input.filePath);
    ea.reset();

    try {
      const viewElements = (ea.getViewElements() ?? []).filter((el) => !el.isDeleted);
      if (viewElements.length > 0) {
        ea.copyViewElementsToEAforEditing(viewElements);
      }

      const fromEl = ea.getElement(input.fromId);
      const toEl = ea.getElement(input.toId);
      if (!fromEl) {
        throw new EaAdapterError("NOT_FOUND", `Source element "${input.fromId}" not found.`);
      }
      if (!toEl) {
        throw new EaAdapterError("NOT_FOUND", `Target element "${input.toId}" not found.`);
      }

      const autoSides = resolveAutoSides(fromEl, toEl);
      const startSide =
        input.startAnchor && input.startAnchor !== "auto"
          ? input.startAnchor
          : autoSides.startSide;
      const endSide =
        input.endAnchor && input.endAnchor !== "auto" ? input.endAnchor : autoSides.endSide;

      const startPoint = getSidePoint(fromEl, startSide);
      const endPoint = getSidePoint(toEl, endSide);

      if (input.style) {
        applyStyleToEa(ea, input.style);
      }

      const fmt: Record<string, unknown> = {
        startObjectId: input.fromId,
        endObjectId: input.toId,
        startArrowHead: input.style?.startArrowHead ?? null,
        endArrowHead: input.style?.endArrowHead ?? "arrow",
        elbowed: input.lineType === "elbow",
      };
      const startFixed = sideToFixedPoint(startSide);
      const endFixed = sideToFixedPoint(endSide);
      if (startFixed) fmt.startFixedPoint = startFixed;
      if (endFixed) fmt.endFixedPoint = endFixed;

      const arrowId = ea.addArrow([startPoint, endPoint], fmt);
      const arrowEl = ea.getElement(arrowId);
      if (arrowEl) {
        if (input.lineType === "curved") {
          arrowEl.roundness = { type: 2 };
        } else if (input.lineType === "straight") {
          arrowEl.roundness = null;
        }
        if (input.style) {
          applyDirectElementFields(arrowEl, input.style, {});
        }
      }

      let labelId: string | undefined;
      if (input.label && input.label.trim().length > 0 && arrowEl) {
        const midX = (startPoint[0] + endPoint[0]) / 2;
        const midY = (startPoint[1] + endPoint[1]) / 2;
        ea.style.fontSize = input.style?.fontSize ?? 16;
        labelId = ea.addText(midX, midY, input.label, {
          textAlign: "center",
          textVerticalAlign: "middle",
        });
        const labelEl = ea.getElement(labelId);
        if (labelEl) {
          labelEl.containerId = arrowId;
          labelEl.textAlign = "center";
          labelEl.verticalAlign = "middle";
        }
        arrowEl.boundElements = [
          ...(arrowEl.boundElements ?? []),
          { id: labelId, type: "text" },
        ];
      }

      await ea.addElementsToView(false, true, true);

      const allElements = this.readAllSnapshots(ea, false);
      const createdIds = new Set(labelId ? [arrowId, labelId] : [arrowId]);
      const createdElements = allElements.filter((el) => createdIds.has(el.id));
      return {
        filePath,
        arrowId,
        ...(labelId ? { labelId } : {}),
        createdElements,
        allElements,
      };
    } finally {
      ea.clear();
    }
  }

  async addMermaid(input: AddMermaidInput): Promise<{
    filePath: string;
    createdIds: string[];
    createdElements: ElementSnapshot[];
    allElements: ElementSnapshot[];
  }> {
    const { ea, filePath } = this.resolveView(input.filePath);
    ea.reset();

    try {
      if (input.fontSize !== undefined) {
        ea.style.fontSize = input.fontSize;
      }
      const result = await ea.addMermaid(input.mermaid, true);
      if (typeof result === "string") {
        throw new EaAdapterError("MERMAID_ERROR", `Mermaid conversion failed: ${result}`);
      }
      const createdIds = Array.isArray(result) ? result : [];
      const offsetX = input.offsetX ?? 0;
      const offsetY = input.offsetY ?? 0;

      if (offsetX !== 0 || offsetY !== 0 || input.fontSize !== undefined) {
        for (const id of createdIds) {
          const el = ea.getElement(id);
          if (!el) continue;
          el.x += offsetX;
          el.y += offsetY;
          if (input.fontSize !== undefined && el.type === "text") {
            el.fontSize = input.fontSize;
          }
        }
      }

      await ea.addElementsToView(false, true, true);
      const allElements = this.readAllSnapshots(ea, false);
      const createdSet = new Set(createdIds);
      const createdElements = allElements.filter((el) => createdSet.has(el.id));
      return { filePath, createdIds, createdElements, allElements };
    } finally {
      ea.clear();
    }
  }

  async applyElementPositions(
    filePath: string | undefined,
    patches: ElementPositionPatch[],
  ): Promise<{
    filePath: string;
    updatedElements: ElementSnapshot[];
    allElements: ElementSnapshot[];
  }> {
    const { ea, filePath: resolvedPath } = this.resolveView(filePath);
    ea.clear();

    try {
      const viewElements = (ea.getViewElements() ?? []).filter((el) => !el.isDeleted);
      if (viewElements.length > 0) {
        ea.copyViewElementsToEAforEditing(viewElements);
      }

      const updatedIds = new Set<string>();
      for (const patch of patches) {
        const el = ea.getElement(patch.id);
        if (!el) continue;
        el.x = patch.x;
        el.y = patch.y;
        updatedIds.add(patch.id);
      }

      if (updatedIds.size > 0) {
        await ea.addElementsToView(false, true, false);
      }

      const allElements = this.readAllSnapshots(ea, false);
      const updatedElements = allElements.filter((el) => updatedIds.has(el.id));
      return { filePath: resolvedPath, updatedElements, allElements };
    } finally {
      ea.clear();
    }
  }

  async restackElements(
    filePath: string | undefined,
    orderedIds: string[],
  ): Promise<{
    filePath: string;
    order: string[];
    allElements: ElementSnapshot[];
  }> {
    const { ea, filePath: resolvedPath } = this.resolveView(filePath);

    for (let targetIndex = 0; targetIndex < orderedIds.length; targetIndex++) {
      const id = orderedIds[targetIndex];
      ea.moveViewElementToZIndex(id, targetIndex);
    }

    const allElements = this.readAllSnapshots(ea, false);
    return {
      filePath: resolvedPath,
      order: allElements.map((el) => el.id),
      allElements,
    };
  }

  async clearScene(filePath?: string): Promise<{
    filePath: string;
    clearedCount: number;
  }> {
    const { ea, filePath: resolvedPath } = this.resolveView(filePath);
    const active = (ea.getViewElements() ?? []).filter((el) => !el.isDeleted);
    if (active.length > 0) {
      ea.deleteViewElements(active);
    }
    return { filePath: resolvedPath, clearedCount: active.length };
  }

  async exportImage(input: ExtendedExportImageInput): Promise<ExportImageOutput> {
    const savePath = input.outputPath ?? input.saveToVaultPath;
    if (savePath !== undefined) {
      const pathCheck = validateVaultRelativePath(savePath);
      if (!pathCheck.ok) {
        throw new EaAdapterError("INVALID_PATH", pathCheck.error);
      }
    }

    const { ea, filePath } = this.resolveView(input.filePath);
    ea.clear();

    try {
      const rawAll = (ea.getViewElements() ?? []).filter((el) => !el.isDeleted);
      let rawTargets = rawAll;

      if (input.ids && input.ids.length > 0) {
        const includeBound = input.includeBoundElements ?? true;
        if (includeBound) {
          const snapshots = rawAll.map(mapRawElementToSnapshot);
          const closure = collectBoundElementClosure(snapshots, input.ids);
          rawTargets = rawAll.filter((el) => closure.has(el.id));
        } else {
          const idSet = new Set(input.ids);
          rawTargets = rawAll.filter((el) => idSet.has(el.id));
        }
      }

      if (rawTargets.length > 0) {
        ea.copyViewElementsToEAforEditing(rawTargets, true);
      }

      const withBackground = input.background ?? true;
      const withTheme = input.darkMode !== undefined;
      const theme = input.darkMode === true ? "dark" : input.darkMode === false ? "light" : undefined;
      const exportSettings = ea.getExportSettings(withBackground, withTheme);
      const loader = ea.getEmbeddedFilesLoader(input.darkMode);
      const padding = input.padding ?? 10;
      const scale = input.scale ?? 1;

      if (input.format === "png") {
        const pngResult = await ea.createPNG(
          undefined,
          scale,
          exportSettings,
          loader,
          theme,
          padding,
        );

        let arrayBuf: ArrayBuffer;
        if (pngResult && typeof (pngResult as Blob).arrayBuffer === "function") {
          arrayBuf = await (pngResult as Blob).arrayBuffer();
        } else if (pngResult instanceof ArrayBuffer) {
          arrayBuf = pngResult;
        } else if (ArrayBuffer.isView(pngResult)) {
          arrayBuf = pngResult.buffer.slice(
            pngResult.byteOffset,
            pngResult.byteOffset + pngResult.byteLength,
          ) as ArrayBuffer;
        } else {
          throw new EaAdapterError(
            "EXPORT_FAILED",
            "ExcalidrawAutomate.createPNG did not return a Blob or binary buffer.",
          );
        }

        const base64 = Buffer.from(arrayBuf).toString("base64");
        if (savePath !== undefined) {
          await this.writeVaultBinary(ea, savePath, arrayBuf);
        }

        return {
          filePath,
          format: "png",
          mimeType: "image/png",
          data: base64,
          encoding: "base64",
          ...(savePath !== undefined ? { savedToPath: savePath } : {}),
        };
      }

      const svgEl = await ea.createSVG(
        undefined,
        true,
        exportSettings,
        loader,
        theme,
        padding,
      );
      if (!svgEl) {
        throw new EaAdapterError(
          "EXPORT_FAILED",
          "ExcalidrawAutomate.createSVG returned no SVG element.",
        );
      }

      const svgText =
        typeof svgEl.outerHTML === "string" && svgEl.outerHTML.length > 0
          ? svgEl.outerHTML
          : new XMLSerializer().serializeToString(svgEl);

      const widthAttr = Number.parseFloat(svgEl.getAttribute?.("width") ?? "");
      const heightAttr = Number.parseFloat(svgEl.getAttribute?.("height") ?? "");

      if (savePath !== undefined) {
        await this.writeVaultText(ea, savePath, svgText);
      }

      return {
        filePath,
        format: "svg",
        mimeType: "image/svg+xml",
        data: svgText,
        encoding: "utf8",
        ...(Number.isFinite(widthAttr) ? { width: widthAttr } : {}),
        ...(Number.isFinite(heightAttr) ? { height: heightAttr } : {}),
        ...(savePath !== undefined ? { savedToPath: savePath } : {}),
      };
    } finally {
      ea.clear();
    }
  }

  private async ensureParentFolder(ea: ExcalidrawAutomateApi, vaultPath: string): Promise<void> {
    const slashIdx = vaultPath.lastIndexOf("/");
    if (slashIdx > 0) {
      const folderPath = vaultPath.slice(0, slashIdx);
      await ea.checkAndCreateFolder(folderPath);
    }
  }

  private async writeVaultBinary(
    ea: ExcalidrawAutomateApi,
    vaultPath: string,
    data: ArrayBuffer,
  ): Promise<void> {
    await this.ensureParentFolder(ea, vaultPath);
    const existing = this.app.vault.getAbstractFileByPath(vaultPath);
    if (existing) {
      if (!isTFile(existing)) {
        throw new EaAdapterError("INVALID_PATH", `Path "${vaultPath}" exists and is a folder.`);
      }
      await this.app.vault.modifyBinary(existing, data);
      return;
    }
    await this.app.vault.createBinary(vaultPath, data);
  }

  private async writeVaultText(
    ea: ExcalidrawAutomateApi,
    vaultPath: string,
    data: string,
  ): Promise<void> {
    await this.ensureParentFolder(ea, vaultPath);
    const existing = this.app.vault.getAbstractFileByPath(vaultPath);
    if (existing) {
      if (!isTFile(existing)) {
        throw new EaAdapterError("INVALID_PATH", `Path "${vaultPath}" exists and is a folder.`);
      }
      await this.app.vault.modify(existing, data);
      return;
    }
    await this.app.vault.create(vaultPath, data);
  }
}
