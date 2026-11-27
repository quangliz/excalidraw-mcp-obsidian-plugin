export type ElementType =
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "text"
  | "arrow"
  | "line"
  | "frame"
  | "freedraw"
  | "image"
  | "embeddable";

export interface ElementStyle {
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: "hachure" | "cross-hatch" | "solid" | "zigzag" | (string & {});
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted" | (string & {});
  roughness?: number;
  opacity?: number;
  roundness?: { type: number; value?: number } | null;
  fontFamily?: number;
  fontSize?: number;
  textAlign?: "left" | "center" | "right" | (string & {});
  verticalAlign?: "top" | "middle" | "bottom" | (string & {});
  startArrowHead?: string | null;
  endArrowHead?: string | null;
  angle?: number;
}

export interface BoundElementRef {
  id: string;
  type: string;
}

export interface ElementBinding {
  elementId: string;
  focus?: number;
  gap?: number;
  fixedPoint?: [number, number] | null;
}

export interface ElementSnapshot {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  text?: string;
  rawText?: string;
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
  startArrowHead?: string | null;
  endArrowHead?: string | null;
  isDeleted?: boolean;
  customData?: Record<string, unknown>;
}

export type LayoutWarningSeverity = "warning" | "error";

export type LayoutWarningType =
  | "text_overflow"
  | "shape_overlap"
  | "arrow_intersects_shape"
  | "disconnected_arrow";

export interface LayoutWarning {
  type: LayoutWarningType;
  severity: LayoutWarningSeverity;
  elementIds: string[];
  message: string;
  hint: string;
}

// ---------------------------------------------------------------------------
// Bridge Tool Input / Output Contracts
// ---------------------------------------------------------------------------

export interface SceneTargetInput {
  filePath?: string;
}

export interface SceneBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export type GetSceneInfoInput = SceneTargetInput;

export interface GetSceneInfoOutput {
  filePath: string;
  title: string;
  elementCount: number;
  activeViewType?: string;
  appState?: {
    viewBackgroundColor?: string;
    gridSize?: number | null;
    theme?: string;
    scrollX?: number;
    scrollY?: number;
    zoom?: number;
  };
  bounds: SceneBounds | null;
  typeCounts: Partial<Record<ElementType, number>>;
  frameIds: string[];
}

export interface GetElementsInput extends SceneTargetInput {
  ids?: string[];
  includeDeleted?: boolean;
}

export interface GetElementsOutput {
  filePath: string;
  elements: ElementSnapshot[];
  count: number;
}

export interface SearchElementsInput extends SceneTargetInput {
  query?: string;
  types?: ElementType[];
  frameId?: string;
  groupId?: string;
  limit?: number;
  includeDeleted?: boolean;
}

export interface SearchElementsOutput {
  filePath: string;
  elements: ElementSnapshot[];
  totalMatched: number;
}

export type GetSelectedElementsInput = SceneTargetInput;

export interface GetSelectedElementsOutput {
  filePath: string;
  elements: ElementSnapshot[];
  selectedIds: string[];
}

export interface SetViewInput extends SceneTargetInput {
  targetElementIds?: string[];
  scrollToContent?: boolean;
  zoom?: number;
  scrollX?: number;
  scrollY?: number;
  padding?: number;
}

export interface SetViewOutput {
  filePath: string;
  scrollX: number;
  scrollY: number;
  zoom: number;
  focusedElementIds?: string[];
}

export interface ElementLabelSpec {
  text: string;
  fontSize?: number;
  fontFamily?: number;
  strokeColor?: string;
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
}

export interface ElementCreateSpec extends ElementStyle {
  id?: string;
  type: ElementType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  points?: [number, number][];
  frameId?: string | null;
  groupIds?: string[];
  containerId?: string | null;
  startBinding?: ElementBinding | null;
  endBinding?: ElementBinding | null;
  label?: ElementLabelSpec;
  customData?: Record<string, unknown>;
  style?: ElementStyle;
}

export interface CreateElementsInput extends SceneTargetInput {
  elements: ElementCreateSpec[];
  selectCreated?: boolean;
  scrollToCreated?: boolean;
}

export interface CreateElementsOutput {
  filePath: string;
  createdIds: string[];
  elements: ElementSnapshot[];
  warnings?: LayoutWarning[];
}

export interface ElementUpdatePatch extends ElementStyle {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  points?: [number, number][];
  frameId?: string | null;
  groupIds?: string[];
  containerId?: string | null;
  startBinding?: ElementBinding | null;
  endBinding?: ElementBinding | null;
  isDeleted?: boolean;
  customData?: Record<string, unknown>;
  style?: ElementStyle;
}

export interface UpdateElementsInput extends SceneTargetInput {
  updates: ElementUpdatePatch[];
}

export interface UpdateElementsOutput {
  filePath: string;
  updatedIds: string[];
  notFoundIds: string[];
  elements: ElementSnapshot[];
  warnings?: LayoutWarning[];
}

export interface DeleteElementsInput extends SceneTargetInput {
  ids: string[];
  deleteBoundElements?: boolean;
}

export interface DeleteElementsOutput {
  filePath: string;
  deletedIds: string[];
  notFoundIds: string[];
}

export type AnchorSide = "auto" | "top" | "bottom" | "left" | "right" | "center";
export type ConnectorLineType = "straight" | "curved" | "elbow";

export interface ConnectElementsInput extends SceneTargetInput {
  fromId: string;
  toId: string;
  label?: string;
  startAnchor?: AnchorSide;
  endAnchor?: AnchorSide;
  lineType?: ConnectorLineType;
  style?: ElementStyle;
}

export interface ConnectElementsOutput {
  filePath: string;
  arrowId: string;
  labelId?: string;
  elements: ElementSnapshot[];
  warnings?: LayoutWarning[];
}

export interface AddMermaidInput extends SceneTargetInput {
  mermaid: string;
  offsetX?: number;
  offsetY?: number;
  fontSize?: number;
}

export interface AddMermaidOutput {
  filePath: string;
  createdIds: string[];
  elements: ElementSnapshot[];
  warnings?: LayoutWarning[];
}

export type AlignmentMode =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom"
  | "distribute-horizontal"
  | "distribute-vertical";

export interface AlignElementsInput extends SceneTargetInput {
  ids: string[];
  alignment: AlignmentMode;
}

export interface AlignElementsOutput {
  filePath: string;
  alignedIds: string[];
  elements: ElementSnapshot[];
}

export type RestackDirection = "front" | "back" | "forward" | "backward";

export interface RestackElementsInput extends SceneTargetInput {
  ids: string[];
  direction: RestackDirection;
}

export interface RestackElementsOutput {
  filePath: string;
  restackedIds: string[];
  order: string[];
}

export interface ClearSceneInput extends SceneTargetInput {
  confirm: boolean;
}

export interface ClearSceneOutput {
  filePath: string;
  clearedCount: number;
}

export interface CheckLayoutInput extends SceneTargetInput {
  ids?: string[];
}

export interface CheckLayoutOutput {
  filePath: string;
  elementCount: number;
  warningCount: number;
  errorCount: number;
  warnings: LayoutWarning[];
}

export type ExportImageFormat = "svg" | "png";

export interface ExportImageInput extends SceneTargetInput {
  format: ExportImageFormat;
  ids?: string[];
  background?: boolean;
  padding?: number;
  scale?: number;
  darkMode?: boolean;
  embedScene?: boolean;
  outputPath?: string;
}

export interface ExportImageOutput {
  filePath: string;
  format: ExportImageFormat;
  mimeType: string;
  data: string;
  encoding: "utf8" | "base64";
  width?: number;
  height?: number;
  savedToPath?: string;
}

export interface BridgeActionPayloads {
  get_scene_info: { input: GetSceneInfoInput; output: GetSceneInfoOutput };
  get_elements: { input: GetElementsInput; output: GetElementsOutput };
  search_elements: { input: SearchElementsInput; output: SearchElementsOutput };
  get_selected_elements: { input: GetSelectedElementsInput; output: GetSelectedElementsOutput };
  set_view: { input: SetViewInput; output: SetViewOutput };
  create_elements: { input: CreateElementsInput; output: CreateElementsOutput };
  update_elements: { input: UpdateElementsInput; output: UpdateElementsOutput };
  delete_elements: { input: DeleteElementsInput; output: DeleteElementsOutput };
  connect_elements: { input: ConnectElementsInput; output: ConnectElementsOutput };
  add_mermaid: { input: AddMermaidInput; output: AddMermaidOutput };
  align_elements: { input: AlignElementsInput; output: AlignElementsOutput };
  restack_elements: { input: RestackElementsInput; output: RestackElementsOutput };
  clear_scene: { input: ClearSceneInput; output: ClearSceneOutput };
  check_layout: { input: CheckLayoutInput; output: CheckLayoutOutput };
  export_image: { input: ExportImageInput; output: ExportImageOutput };
}
