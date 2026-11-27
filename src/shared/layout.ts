import type {
  ElementSnapshot,
  ElementType,
  LayoutWarning,
} from "./types.ts";

interface BBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
}

type Point = [number, number];

const SHAPE_TYPES = new Set<ElementType>(["rectangle", "ellipse", "diamond"]);
const OBSTACLE_SHAPE_TYPES = new Set<ElementType>([
  "rectangle",
  "ellipse",
  "diamond",
  "image",
  "embeddable",
]);
const CONTAINER_TYPES = new Set<ElementType>([
  "rectangle",
  "ellipse",
  "diamond",
  "frame",
  "image",
  "embeddable",
]);

function getElementBBox(el: ElementSnapshot): BBox {
  if ((el.type === "arrow" || el.type === "line") && el.points && el.points.length > 0) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [px, py] of el.points) {
      const ax = el.x + px;
      const ay = el.y + py;
      if (ax < minX) minX = ax;
      if (ay < minY) minY = ay;
      if (ax > maxX) maxX = ax;
      if (ay > maxY) maxY = ay;
    }
    return {
      x1: minX,
      y1: minY,
      x2: maxX,
      y2: maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  const rawX1 = Math.min(el.x, el.x + el.width);
  const rawY1 = Math.min(el.y, el.y + el.height);
  const rawX2 = Math.max(el.x, el.x + el.width);
  const rawY2 = Math.max(el.y, el.y + el.height);

  if (!el.angle || Math.abs(el.angle) < 1e-6) {
    return {
      x1: rawX1,
      y1: rawY1,
      x2: rawX2,
      y2: rawY2,
      width: rawX2 - rawX1,
      height: rawY2 - rawY1,
    };
  }

  const cx = (rawX1 + rawX2) / 2;
  const cy = (rawY1 + rawY2) / 2;
  const cos = Math.cos(el.angle);
  const sin = Math.sin(el.angle);
  const corners: Point[] = [
    [rawX1, rawY1],
    [rawX2, rawY1],
    [rawX2, rawY2],
    [rawX1, rawY2],
  ];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of corners) {
    const dx = px - cx;
    const dy = py - cy;
    const rx = cx + dx * cos - dy * sin;
    const ry = cy + dx * sin + dy * cos;
    if (rx < minX) minX = rx;
    if (ry < minY) minY = ry;
    if (rx > maxX) maxX = rx;
    if (ry > maxY) maxY = ry;
  }

  return {
    x1: minX,
    y1: minY,
    x2: maxX,
    y2: maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function boxContains(outer: BBox, inner: BBox, tolerance = 2): boolean {
  return (
    outer.x1 <= inner.x1 + tolerance &&
    outer.y1 <= inner.y1 + tolerance &&
    outer.x2 >= inner.x2 - tolerance &&
    outer.y2 >= inner.y2 - tolerance
  );
}

function estimateWrappedTextSize(
  text: string,
  fontSize: number,
  maxWidth: number,
): { estimatedHeight: number; longestWordWidth: number } {
  const avgCharWidth = fontSize * 0.55;
  const lineHeight = fontSize * 1.25;
  const effectiveWidth = Math.max(maxWidth, fontSize);
  const lines = text.split(/\r?\n/);

  let totalLines = 0;
  let longestWordWidth = 0;

  for (const line of lines) {
    const words = line.trim().length === 0 ? [""] : line.split(/\s+/);
    for (const word of words) {
      const w = word.length * avgCharWidth;
      if (w > longestWordWidth) {
        longestWordWidth = w;
      }
    }
    const lineWidth = line.length * avgCharWidth;
    const wrapped = Math.max(1, Math.ceil(lineWidth / effectiveWidth));
    totalLines += wrapped;
  }

  return {
    estimatedHeight: totalLines * lineHeight,
    longestWordWidth,
  };
}

function segmentIntersectsRect(
  p1: Point,
  p2: Point,
  rect: BBox,
  inset = 2,
): boolean {
  const minX = rect.x1 + inset;
  const minY = rect.y1 + inset;
  const maxX = rect.x2 - inset;
  const maxY = rect.y2 - inset;

  if (minX >= maxX || minY >= maxY) {
    return false;
  }

  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];

  let t0 = 0;
  let t1 = 1;

  const checks: [number, number][] = [
    [-dx, p1[0] - minX],
    [dx, maxX - p1[0]],
    [-dy, p1[1] - minY],
    [dy, maxY - p1[1]],
  ];

  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }

  return t0 < t1;
}

function getArrowPoints(arrow: ElementSnapshot): Point[] {
  if (arrow.points && arrow.points.length >= 2) {
    return arrow.points.map(([px, py]) => [arrow.x + px, arrow.y + py]);
  }
  return [
    [arrow.x, arrow.y],
    [arrow.x + arrow.width, arrow.y + arrow.height],
  ];
}

function checkTextOverflow(
  activeElements: ElementSnapshot[],
  activeById: Map<string, ElementSnapshot>,
  bboxById: Map<string, BBox>,
): LayoutWarning[] {
  const warnings: LayoutWarning[] = [];

  for (const el of activeElements) {
    if (el.type === "text") {
      const textBox = bboxById.get(el.id)!;
      const content = el.text ?? el.rawText ?? "";
      const fontSize = el.fontSize ?? 20;

      if (el.containerId) {
        const container = activeById.get(el.containerId);
        if (!container || !CONTAINER_TYPES.has(container.type)) {
          continue;
        }
        const containerBox = bboxById.get(container.id)!;
        const paddingTolerance = 2;
        const innerPadding = 8;

        const exceedsBounds =
          textBox.width > containerBox.width - 2 ||
          textBox.height > containerBox.height - 2 ||
          textBox.x1 < containerBox.x1 - paddingTolerance ||
          textBox.x2 > containerBox.x2 + paddingTolerance ||
          textBox.y1 < containerBox.y1 - paddingTolerance ||
          textBox.y2 > containerBox.y2 + paddingTolerance;

        let exceedsHeuristic = false;
        if (content.length > 0 && containerBox.width > 0 && containerBox.height > 0) {
          const innerWidth = Math.max(containerBox.width - innerPadding * 2, fontSize);
          const innerHeight = Math.max(containerBox.height - innerPadding, fontSize);
          const { estimatedHeight, longestWordWidth } = estimateWrappedTextSize(
            content,
            fontSize,
            innerWidth,
          );
          if (estimatedHeight > innerHeight + 4 || longestWordWidth > innerWidth + 4) {
            exceedsHeuristic = true;
          }
        }

        if (exceedsBounds || exceedsHeuristic) {
          const severe =
            textBox.width > containerBox.width * 1.25 ||
            textBox.height > containerBox.height * 1.25;
          warnings.push({
            type: "text_overflow",
            severity: severe ? "error" : "warning",
            elementIds: [el.id, container.id],
            message: `Text element "${el.id}" overflows container "${container.id}".`,
            hint: `Increase the size of "${container.id}", shorten the text, or reduce fontSize.`,
          });
        }
      } else if (content.length > 0 && textBox.width > 0 && textBox.height > 0) {
        const { estimatedHeight, longestWordWidth } = estimateWrappedTextSize(
          content,
          fontSize,
          textBox.width,
        );
        if (
          estimatedHeight > textBox.height * 1.2 + 4 ||
          longestWordWidth > textBox.width * 1.2 + 4
        ) {
          warnings.push({
            type: "text_overflow",
            severity: "warning",
            elementIds: [el.id],
            message: `Text element "${el.id}" content exceeds its bounding box.`,
            hint: `Widen or heighten text element "${el.id}", or shorten its text.`,
          });
        }
      }
      continue;
    }

    if (SHAPE_TYPES.has(el.type)) {
      const content = el.text ?? el.rawText ?? "";
      if (content.length > 0 && el.width > 0 && el.height > 0) {
        const fontSize = el.fontSize ?? 20;
        const box = bboxById.get(el.id)!;
        const innerWidth = Math.max(box.width - 16, fontSize);
        const innerHeight = Math.max(box.height - 8, fontSize);
        const { estimatedHeight, longestWordWidth } = estimateWrappedTextSize(
          content,
          fontSize,
          innerWidth,
        );
        if (estimatedHeight > innerHeight + 4 || longestWordWidth > innerWidth + 4) {
          warnings.push({
            type: "text_overflow",
            severity: "warning",
            elementIds: [el.id],
            message: `Inline text on shape "${el.id}" overflows its bounds.`,
            hint: `Resize "${el.id}", shorten its text, or lower fontSize.`,
          });
        }
      }
    }
  }

  return warnings;
}

function checkShapeOverlap(
  activeElements: ElementSnapshot[],
  bboxById: Map<string, BBox>,
): LayoutWarning[] {
  const warnings: LayoutWarning[] = [];
  const shapes = activeElements.filter((el) => SHAPE_TYPES.has(el.type));

  for (let i = 0; i < shapes.length; i++) {
    const a = shapes[i];
    const boxA = bboxById.get(a.id)!;
    const areaA = boxA.width * boxA.height;
    if (areaA <= 0) continue;

    for (let j = i + 1; j < shapes.length; j++) {
      const b = shapes[j];
      const boxB = bboxById.get(b.id)!;
      const areaB = boxB.width * boxB.height;
      if (areaB <= 0) continue;

      const ix1 = Math.max(boxA.x1, boxB.x1);
      const iy1 = Math.max(boxA.y1, boxB.y1);
      const ix2 = Math.min(boxA.x2, boxB.x2);
      const iy2 = Math.min(boxA.y2, boxB.y2);

      const iw = ix2 - ix1;
      const ih = iy2 - iy1;
      if (iw <= 4 || ih <= 4) continue;

      // Ignore intentional containment (e.g., container box around nested shapes)
      if (boxContains(boxA, boxB) || boxContains(boxB, boxA)) {
        continue;
      }

      const interArea = iw * ih;
      const minArea = Math.min(areaA, areaB);
      const overlapRatio = interArea / minArea;

      if (overlapRatio >= 0.05 || interArea > 100) {
        warnings.push({
          type: "shape_overlap",
          severity: overlapRatio >= 0.5 ? "error" : "warning",
          elementIds: [a.id, b.id],
          message: `Shapes "${a.id}" and "${b.id}" overlap (${Math.round(overlapRatio * 100)}% of smaller shape).`,
          hint: `Reposition or resize "${a.id}" or "${b.id}" so they have clear separation.`,
        });
      }
    }
  }

  return warnings;
}

function checkArrows(
  activeElements: ElementSnapshot[],
  activeById: Map<string, ElementSnapshot>,
  bboxById: Map<string, BBox>,
): LayoutWarning[] {
  const warnings: LayoutWarning[] = [];
  const arrows = activeElements.filter((el) => el.type === "arrow");
  const obstacles = activeElements.filter((el) => OBSTACLE_SHAPE_TYPES.has(el.type));

  for (const arrow of arrows) {
    const startId = arrow.startBinding?.elementId;
    const endId = arrow.endBinding?.elementId;

    const startTarget = startId ? activeById.get(startId) : undefined;
    const endTarget = endId ? activeById.get(endId) : undefined;

    const missingStart = !startId;
    const missingEnd = !endId;
    const danglingStart = Boolean(startId && !startTarget);
    const danglingEnd = Boolean(endId && !endTarget);

    if (missingStart || missingEnd || danglingStart || danglingEnd) {
      const problems: string[] = [];
      if (missingStart) problems.push("missing startBinding");
      if (danglingStart) problems.push(`startBinding target "${startId}" not found or deleted`);
      if (missingEnd) problems.push("missing endBinding");
      if (danglingEnd) problems.push(`endBinding target "${endId}" not found or deleted`);

      warnings.push({
        type: "disconnected_arrow",
        severity: danglingStart || danglingEnd || (missingStart && missingEnd) ? "error" : "warning",
        elementIds: [arrow.id],
        message: `Arrow "${arrow.id}" is disconnected (${problems.join(", ")}).`,
        hint: `Bind both startBinding and endBinding of "${arrow.id}" to valid active elements using connect_elements.`,
      });
    }

    const arrowBox = bboxById.get(arrow.id)!;
    const points = getArrowPoints(arrow);
    const startBox = startTarget ? bboxById.get(startTarget.id) : undefined;
    const endBox = endTarget ? bboxById.get(endTarget.id) : undefined;

    for (const shape of obstacles) {
      if (shape.id === startId || shape.id === endId || shape.id === arrow.frameId) {
        continue;
      }

      const shapeBox = bboxById.get(shape.id)!;

      // Skip enclosing container shapes that surround the arrow or both endpoints
      if (boxContains(shapeBox, arrowBox)) {
        continue;
      }
      if (startBox && endBox && boxContains(shapeBox, startBox) && boxContains(shapeBox, endBox)) {
        continue;
      }

      let hits = false;
      for (let i = 0; i < points.length - 1; i++) {
        if (segmentIntersectsRect(points[i], points[i + 1], shapeBox)) {
          hits = true;
          break;
        }
      }

      if (hits) {
        warnings.push({
          type: "arrow_intersects_shape",
          severity: "warning",
          elementIds: [arrow.id, shape.id],
          message: `Arrow "${arrow.id}" passes through shape "${shape.id}".`,
          hint: `Reroute arrow "${arrow.id}" around "${shape.id}" or adjust shape placement.`,
        });
      }
    }
  }

  return warnings;
}

/**
 * Pure layout analysis over Excalidraw element snapshots.
 * Detects text overflow, overlapping shapes, intersecting arrows, and disconnected arrows.
 */
export function analyzeLayout(elements: ElementSnapshot[]): LayoutWarning[] {
  const activeElements = elements.filter((el) => !el.isDeleted);
  const activeById = new Map<string, ElementSnapshot>();
  const bboxById = new Map<string, BBox>();

  for (const el of activeElements) {
    activeById.set(el.id, el);
    bboxById.set(el.id, getElementBBox(el));
  }

  return [
    ...checkTextOverflow(activeElements, activeById, bboxById),
    ...checkShapeOverlap(activeElements, bboxById),
    ...checkArrows(activeElements, activeById, bboxById),
  ];
}
