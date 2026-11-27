import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { BridgeServer } from "../src/plugin/bridge-server.ts";
import { collectBoundElementClosure, ObsidianEaAdapter } from "../src/plugin/ea-adapter.ts";
import { createBridgeHandlers } from "../src/plugin/handlers.ts";

function createMockAdapter(initialElements = []) {
  let nextId = 1;
  let elements = initialElements.map((el) => structuredClone(el));
  let selectedIds = [];
  let lastExportCall = null;
  const savedFiles = new Map();

  const snapshotAll = (includeDeleted = false) =>
    elements
      .filter((el) => includeDeleted || !el.isDeleted)
      .map((el) => structuredClone(el));

  return {
    get state() {
      return { elements, selectedIds, lastExportCall, savedFiles };
    },
    setSelectedIds(ids) {
      selectedIds = [...ids];
    },
    isAvailable() {
      return true;
    },
    getActiveFilePath() {
      return "Drawings/test.excalidraw.md";
    },
    async getSceneElements(filePath, includeDeleted = false) {
      return {
        filePath: filePath ?? "Drawings/test.excalidraw.md",
        title: "test",
        activeViewType: "excalidraw",
        appState: {
          viewBackgroundColor: "#ffffff",
          gridSize: null,
          theme: "light",
          scrollX: 0,
          scrollY: 0,
          zoom: 1,
        },
        elements: snapshotAll(includeDeleted),
      };
    },
    async getSelectedElementIds(filePath) {
      return {
        filePath: filePath ?? "Drawings/test.excalidraw.md",
        selectedIds: [...selectedIds],
      };
    },
    async setView(input) {
      return {
        filePath: input.filePath ?? "Drawings/test.excalidraw.md",
        scrollX: input.scrollX ?? 10,
        scrollY: input.scrollY ?? 20,
        zoom: input.zoom ?? 1,
        ...(input.targetElementIds ? { focusedElementIds: input.targetElementIds } : {}),
      };
    },
    async createElements(input) {
      const createdIds = [];
      const createdElements = [];
      for (const spec of input.elements) {
        const id = spec.id ?? `el-${nextId++}`;
        const el = {
          id,
          type: spec.type,
          x: spec.x,
          y: spec.y,
          width: spec.width ?? 160,
          height: spec.height ?? 80,
          ...(spec.text !== undefined ? { text: spec.text } : {}),
          ...(spec.points !== undefined ? { points: spec.points } : {}),
          ...(spec.frameId !== undefined ? { frameId: spec.frameId } : {}),
          ...(spec.groupIds !== undefined ? { groupIds: spec.groupIds } : {}),
          ...(spec.startBinding !== undefined ? { startBinding: spec.startBinding } : {}),
          ...(spec.endBinding !== undefined ? { endBinding: spec.endBinding } : {}),
          ...(spec.fontSize !== undefined ? { fontSize: spec.fontSize } : {}),
        };
        elements.push(el);
        createdIds.push(id);
        createdElements.push(structuredClone(el));

        const labelText = spec.label?.text ?? (spec.type !== "text" ? spec.text : undefined);
        if (labelText && (spec.type === "rectangle" || spec.type === "ellipse" || spec.type === "diamond")) {
          const textId = `text-${nextId++}`;
          const textEl = {
            id: textId,
            type: "text",
            x: el.x + 10,
            y: el.y + 10,
            width: Math.max(20, el.width - 20),
            height: Math.max(20, el.height - 20),
            text: labelText,
            fontSize: spec.label?.fontSize ?? 20,
            containerId: id,
          };
          el.boundElements = [{ id: textId, type: "text" }];
          elements.push(textEl);
          createdIds.push(textId);
          createdElements.push(structuredClone(textEl));
        }
      }
      return {
        filePath: input.filePath ?? "Drawings/test.excalidraw.md",
        createdIds,
        createdElements,
        allElements: snapshotAll(false),
      };
    },
    async updateElements(input) {
      const updatedIds = [];
      const notFoundIds = [];
      const updatedElements = [];
      for (const patch of input.updates) {
        const el = elements.find((item) => item.id === patch.id && !item.isDeleted);
        if (!el) {
          notFoundIds.push(patch.id);
          continue;
        }
        Object.assign(el, patch);
        updatedIds.push(patch.id);
        updatedElements.push(structuredClone(el));
      }
      return {
        filePath: input.filePath ?? "Drawings/test.excalidraw.md",
        updatedIds,
        notFoundIds,
        updatedElements,
        allElements: snapshotAll(false),
      };
    },
    async deleteElements(input) {
      const active = snapshotAll(false);
      const seedIds = input.ids.filter((id) => active.some((el) => el.id === id));
      const notFoundIds = input.ids.filter((id) => !seedIds.includes(id));
      const deleteSet = input.deleteBoundElements
        ? collectBoundElementClosure(active, seedIds)
        : new Set(seedIds);
      elements = elements.filter((el) => !deleteSet.has(el.id));
      return {
        filePath: input.filePath ?? "Drawings/test.excalidraw.md",
        deletedIds: Array.from(deleteSet),
        notFoundIds,
        allElements: snapshotAll(false),
      };
    },
    async connectElements(input) {
      const fromEl = elements.find((el) => el.id === input.fromId && !el.isDeleted);
      const toEl = elements.find((el) => el.id === input.toId && !el.isDeleted);
      if (!fromEl || !toEl) {
        throw new Error("Missing element to connect");
      }
      const arrowId = `arrow-${nextId++}`;
      const startX = fromEl.x + fromEl.width;
      const startY = fromEl.y + fromEl.height / 2;
      const endX = toEl.x;
      const endY = toEl.y + toEl.height / 2;
      const arrow = {
        id: arrowId,
        type: "arrow",
        x: startX,
        y: startY,
        width: endX - startX,
        height: endY - startY,
        points: [
          [0, 0],
          [endX - startX, endY - startY],
        ],
        startBinding: { elementId: fromEl.id },
        endBinding: { elementId: toEl.id },
      };
      elements.push(arrow);
      return {
        filePath: input.filePath ?? "Drawings/test.excalidraw.md",
        arrowId,
        createdElements: [structuredClone(arrow)],
        allElements: snapshotAll(false),
      };
    },
    async addMermaid(input) {
      const id = `mermaid-${nextId++}`;
      const rect = { id, type: "rectangle", x: input.offsetX ?? 0, y: input.offsetY ?? 0, width: 140, height: 60 };
      elements.push(rect);
      return {
        filePath: input.filePath ?? "Drawings/test.excalidraw.md",
        createdIds: [id],
        createdElements: [structuredClone(rect)],
        allElements: snapshotAll(false),
      };
    },
    async applyElementPositions(filePath, patches) {
      const updatedElements = [];
      for (const patch of patches) {
        const el = elements.find((item) => item.id === patch.id);
        if (el) {
          el.x = patch.x;
          el.y = patch.y;
          updatedElements.push(structuredClone(el));
        }
      }
      return {
        filePath: filePath ?? "Drawings/test.excalidraw.md",
        updatedElements,
        allElements: snapshotAll(false),
      };
    },
    async restackElements(filePath, orderedIds) {
      const byId = new Map(elements.map((el) => [el.id, el]));
      elements = orderedIds.map((id) => byId.get(id)).filter(Boolean);
      return {
        filePath: filePath ?? "Drawings/test.excalidraw.md",
        order: elements.map((el) => el.id),
        allElements: snapshotAll(false),
      };
    },
    async clearScene(filePath) {
      const clearedCount = elements.filter((el) => !el.isDeleted).length;
      elements = [];
      return {
        filePath: filePath ?? "Drawings/test.excalidraw.md",
        clearedCount,
      };
    },
    async exportImage(input) {
      const active = snapshotAll(false);
      let exportedIds;
      if (input.ids && input.ids.length > 0) {
        const includeBound = input.includeBoundElements ?? true;
        exportedIds = includeBound
          ? Array.from(collectBoundElementClosure(active, input.ids))
          : [...input.ids];
      } else {
        exportedIds = active.map((el) => el.id);
      }

      const savePath = input.outputPath ?? input.saveToVaultPath;
      lastExportCall = { ...input, exportedIds };

      if (input.format === "png") {
        const b64 = Buffer.from(`png:${exportedIds.join(",")}`).toString("base64");
        if (savePath) savedFiles.set(savePath, b64);
        return {
          filePath: input.filePath ?? "Drawings/test.excalidraw.md",
          format: "png",
          mimeType: "image/png",
          data: b64,
          encoding: "base64",
          ...(savePath ? { savedToPath: savePath } : {}),
        };
      }

      const svg = `<svg data-ids="${exportedIds.join(",")}"></svg>`;
      if (savePath) savedFiles.set(savePath, svg);
      return {
        filePath: input.filePath ?? "Drawings/test.excalidraw.md",
        format: "svg",
        mimeType: "image/svg+xml",
        data: svg,
        encoding: "utf8",
        ...(savePath ? { savedToPath: savePath } : {}),
      };
    },
  };
}

describe("bridge server and handlers", () => {
  const servers = [];

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop();
      await server.stop();
    }
  });

  async function startTestServer(adapter, authToken = "") {
    const handlers = createBridgeHandlers(adapter);
    const server = new BridgeServer({
      port: 0,
      getAuthToken: () => authToken,
      handlers,
      adapter,
    });
    const addr = await server.start();
    servers.push(server);
    return { server, baseUrl: `http://${addr.host}:${addr.port}` };
  }

  it("responds to GET /health on 127.0.0.1 ephemeral port", async () => {
    const adapter = createMockAdapter();
    const { baseUrl } = await startTestServer(adapter, "secret-token");

    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.status, "ok");
    assert.equal(body.host, "127.0.0.1");
    assert.equal(body.authRequired, true);
    assert.equal(body.eaAvailable, true);
    assert.equal(body.activeFilePath, "Drawings/test.excalidraw.md");
  });

  it("rejects unauthorized requests and accepts valid Bearer token", async () => {
    const adapter = createMockAdapter();
    const { baseUrl } = await startTestServer(adapter, "top-secret-token");

    const missingAuth = await fetch(`${baseUrl}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_scene_info", params: {} }),
    });
    assert.equal(missingAuth.status, 401);
    const missingBody = await missingAuth.json();
    assert.equal(missingBody.ok, false);
    assert.equal(missingBody.error.code, "UNAUTHORIZED");

    const wrongAuth = await fetch(`${baseUrl}/action/get_scene_info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-token",
      },
      body: JSON.stringify({}),
    });
    assert.equal(wrongAuth.status, 401);

    const validAuth = await fetch(`${baseUrl}/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer top-secret-token",
      },
      body: JSON.stringify({ action: "get_scene_info", params: {}, requestId: "req-1" }),
    });
    assert.equal(validAuth.status, 200);
    const validBody = await validAuth.json();
    assert.equal(validBody.ok, true);
    assert.equal(validBody.requestId, "req-1");
    assert.equal(validBody.data.filePath, "Drawings/test.excalidraw.md");
  });

  it("create_elements returns fresh layoutWarnings from analyzeLayout", async () => {
    const adapter = createMockAdapter();
    const { baseUrl } = await startTestServer(adapter);

    const res = await fetch(`${baseUrl}/action/create_elements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        elements: [
          { id: "a", type: "rectangle", x: 0, y: 0, width: 150, height: 80 },
          { id: "b", type: "rectangle", x: 80, y: 20, width: 150, height: 80 },
        ],
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.data.createdIds, ["a", "b"]);
    assert.ok(Array.isArray(body.data.warnings));
    assert.equal(body.data.warnings.length, 1);
    assert.equal(body.data.warnings[0].type, "shape_overlap");
    assert.deepEqual(body.data.warnings[0].elementIds, ["a", "b"]);
  });

  it("clear_scene rejects unless confirm === true", async () => {
    const adapter = createMockAdapter([
      { id: "box-1", type: "rectangle", x: 0, y: 0, width: 100, height: 50 },
    ]);
    const { baseUrl } = await startTestServer(adapter);

    const rejected = await fetch(`${baseUrl}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear_scene", params: { confirm: false } }),
    });
    assert.equal(rejected.status, 400);
    const rejectedBody = await rejected.json();
    assert.equal(rejectedBody.ok, false);
    assert.equal(rejectedBody.error.code, "CONFIRMATION_REQUIRED");
    assert.equal(adapter.state.elements.length, 1);

    const accepted = await fetch(`${baseUrl}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear_scene", params: { confirm: true } }),
    });
    assert.equal(accepted.status, 200);
    const acceptedBody = await accepted.json();
    assert.equal(acceptedBody.ok, true);
    assert.equal(acceptedBody.data.clearedCount, 1);
    assert.equal(adapter.state.elements.length, 0);
  });

  it("align_elements aligns shapes, shifts bound text, and distributes evenly", async () => {
    const adapter = createMockAdapter([
      {
        id: "r1",
        type: "rectangle",
        x: 0,
        y: 10,
        width: 100,
        height: 50,
        boundElements: [{ id: "t1", type: "text" }],
      },
      {
        id: "t1",
        type: "text",
        x: 10,
        y: 20,
        width: 80,
        height: 30,
        text: "One",
        containerId: "r1",
      },
      { id: "r2", type: "rectangle", x: 50, y: 120, width: 100, height: 50 },
      { id: "r3", type: "rectangle", x: 300, y: 60, width: 100, height: 50 },
    ]);
    const handlers = createBridgeHandlers(adapter);

    const leftRes = await handlers.align_elements({
      ids: ["r1", "r2", "r3"],
      alignment: "left",
    });
    assert.deepEqual(leftRes.alignedIds, ["r1", "r2", "r3"]);
    for (const el of leftRes.elements) {
      assert.equal(el.x, 0);
    }

    // Re-position r1, r2, r3 horizontally and test distribute-horizontal + bound text shift
    await adapter.applyElementPositions(undefined, [
      { id: "r1", x: 0, y: 0 },
      { id: "t1", x: 10, y: 10 },
      { id: "r2", x: 40, y: 0 },
      { id: "r3", x: 400, y: 0 },
    ]);

    const distRes = await handlers.align_elements({
      ids: ["r1", "r2", "r3"],
      alignment: "distribute-horizontal",
    });
    const byId = new Map(distRes.elements.map((el) => [el.id, el]));
    assert.equal(byId.get("r1").x, 0);
    assert.equal(byId.get("r2").x, 200);
    assert.equal(byId.get("r3").x, 400);
  });

  it("restack_elements supports front, back, forward, and backward", async () => {
    const adapter = createMockAdapter([
      { id: "a", type: "rectangle", x: 0, y: 0, width: 50, height: 50 },
      { id: "b", type: "rectangle", x: 100, y: 0, width: 50, height: 50 },
      { id: "c", type: "rectangle", x: 200, y: 0, width: 50, height: 50 },
    ]);
    const handlers = createBridgeHandlers(adapter);

    const frontRes = await handlers.restack_elements({ ids: ["a"], direction: "front" });
    assert.deepEqual(frontRes.order, ["b", "c", "a"]);

    const backRes = await handlers.restack_elements({ ids: ["a"], direction: "back" });
    assert.deepEqual(backRes.order, ["a", "b", "c"]);

    const forwardRes = await handlers.restack_elements({ ids: ["a"], direction: "forward" });
    assert.deepEqual(forwardRes.order, ["b", "a", "c"]);

    const backwardRes = await handlers.restack_elements({ ids: ["c"], direction: "backward" });
    assert.deepEqual(backwardRes.order, ["b", "c", "a"]);
  });

  it("export_image includes bound elements closure and validates vault-relative paths", async () => {
    const adapter = createMockAdapter([
      {
        id: "box-1",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 160,
        height: 80,
        boundElements: [{ id: "label-1", type: "text" }],
      },
      {
        id: "label-1",
        type: "text",
        x: 20,
        y: 25,
        width: 120,
        height: 30,
        text: "Service A",
        containerId: "box-1",
      },
      {
        id: "box-2",
        type: "rectangle",
        x: 300,
        y: 0,
        width: 160,
        height: 80,
      },
    ]);
    const { baseUrl } = await startTestServer(adapter);

    // Reject path traversal and absolute paths
    for (const badPath of ["../escape.png", "/etc/passwd.png", "file:///tmp/x.png", "C:\\x.png"]) {
      const badRes = await fetch(`${baseUrl}/action/export_image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "png",
          ids: ["box-1"],
          saveToVaultPath: badPath,
        }),
      });
      assert.equal(badRes.status, 400);
      const badBody = await badRes.json();
      assert.equal(badBody.ok, false);
      assert.equal(badBody.error.code, "INVALID_PATH");
    }

    // Export subset with includeBoundElements (default true) + valid outputPath
    const goodRes = await fetch(`${baseUrl}/action/export_image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "svg",
        ids: ["box-1"],
        includeBoundElements: true,
        outputPath: "Exports/service-a.svg",
      }),
    });
    assert.equal(goodRes.status, 200);
    const goodBody = await goodRes.json();
    assert.equal(goodBody.ok, true);
    assert.equal(goodBody.data.savedToPath, "Exports/service-a.svg");
    assert.equal(goodBody.data.data, '<svg data-ids="box-1,label-1"></svg>');
    assert.equal(adapter.state.savedFiles.get("Exports/service-a.svg"), goodBody.data.data);

    // Export subset with includeBoundElements: false
    const excludeRes = await fetch(`${baseUrl}/action/export_image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "svg",
        ids: ["box-1"],
        includeBoundElements: false,
      }),
    });
    assert.equal(excludeRes.status, 200);
    const excludeBody = await excludeRes.json();
    assert.equal(excludeBody.data.data, '<svg data-ids="box-1"></svg>');
  });

  it("enforces 2MB JSON body limit on POST requests", async () => {
    const adapter = createMockAdapter();
    const { baseUrl } = await startTestServer(adapter);

    const oversized = JSON.stringify({
      action: "search_elements",
      params: { query: "x".repeat(2 * 1024 * 1024 + 1024) },
    });

    const res = await fetch(`${baseUrl}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: oversized,
    });
    assert.equal(res.status, 413);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "PAYLOAD_TOO_LARGE");
  });
});

describe("ObsidianEaAdapter with realistic ExcalidrawAutomate", () => {
  function createRealisticEaEnv(initialViewElements = []) {
    let viewElements = initialViewElements.map((el) => structuredClone(el));
    let seq = 1;
    let elementsDict = {};
    let imagesDict = {};

    const view = {
      file: { path: "Drawings/board.excalidraw.md", basename: "board" },
      getViewType: () => "excalidraw",
    };

    const ea = {
      targetView: null,
      style: {
        strokeColor: "#000000",
        backgroundColor: "transparent",
        fontSize: 20,
      },
      canvas: { theme: "light", viewBackgroundColor: "#ffffff" },
      setView(target) {
        this.targetView = target === null ? null : view;
        return this.targetView;
      },
      clear() {
        elementsDict = {};
        imagesDict = {};
      },
      reset() {
        this.clear();
        this.style = {
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
        };
      },
      getViewElements() {
        return viewElements;
      },
      copyViewElementsToEAforEditing(els) {
        for (const el of els) {
          elementsDict[el.id] = structuredClone(el);
        }
      },
      getElement(id) {
        return elementsDict[id];
      },
      getElements() {
        return Object.values(elementsDict);
      },
      addRect(x, y, width, height, id) {
        const eid = id ?? `rect-${seq++}`;
        elementsDict[eid] = {
          id: eid,
          type: "rectangle",
          x,
          y,
          width,
          height,
          strokeColor: this.style.strokeColor,
          backgroundColor: this.style.backgroundColor,
        };
        return eid;
      },
      addText(x, y, text, formatting = {}, id) {
        const eid = id ?? `text-${seq++}`;
        elementsDict[eid] = {
          id: eid,
          type: "text",
          x,
          y,
          width: formatting.width ?? 100,
          height: formatting.height ?? 25,
          text,
          rawText: text,
          fontSize: this.style.fontSize,
        };
        return eid;
      },
      addArrow(points, formatting = {}, id) {
        const eid = id ?? `arrow-${seq++}`;
        elementsDict[eid] = {
          id: eid,
          type: "arrow",
          x: points[0][0],
          y: points[0][1],
          width: points[points.length - 1][0] - points[0][0],
          height: points[points.length - 1][1] - points[0][1],
          points: points.map(([px, py]) => [px - points[0][0], py - points[0][1]]),
          startBinding: formatting.startObjectId
            ? { elementId: formatting.startObjectId }
            : null,
          endBinding: formatting.endObjectId
            ? { elementId: formatting.endObjectId }
            : null,
        };
        return eid;
      },
      async addElementsToView() {
        const incoming = Object.values(elementsDict);
        const byId = new Map(incoming.map((el) => [el.id, structuredClone(el)]));
        const updated = viewElements.map((el) => (byId.has(el.id) ? byId.get(el.id) : el));
        const existingIds = new Set(viewElements.map((el) => el.id));
        for (const el of incoming) {
          if (!existingIds.has(el.id)) {
            updated.push(structuredClone(el));
          }
        }
        viewElements = updated;
        return true;
      },
      getExcalidrawAPI: () => null,
      getViewSelectedElements: () => [],
    };

    const app = {
      workspace: {
        getLeavesOfType: (type) => (type === "excalidraw" ? [{ view }] : []),
      },
      vault: {},
    };

    return { app, ea, getViewElements: () => viewElements, getImagesDict: () => imagesDict };
  }

  it("preserves all elements in multi-element createElements batches and resets styles per element", async () => {
    const env = createRealisticEaEnv();
    const prevEa = globalThis.ExcalidrawAutomate;
    globalThis.ExcalidrawAutomate = env.ea;
    try {
      const adapter = new ObsidianEaAdapter(env.app, () => "active");
      const res = await adapter.createElements({
        elements: [
          {
            id: "box-1",
            type: "rectangle",
            x: 0,
            y: 0,
            width: 140,
            height: 70,
            strokeColor: "#ff0000",
            label: { text: "First" },
          },
          {
            id: "box-2",
            type: "rectangle",
            x: 240,
            y: 0,
            width: 140,
            height: 70,
            label: { text: "Second" },
          },
          {
            id: "arr-1",
            type: "arrow",
            x: 140,
            y: 35,
            points: [
              [0, 0],
              [100, 0],
            ],
            startBinding: { elementId: "box-1" },
            endBinding: { elementId: "box-2" },
          },
        ],
      });

      assert.equal(res.createdIds.length, 5);
      const viewEls = env.getViewElements();
      assert.equal(viewEls.length, 5);
      const box1 = viewEls.find((e) => e.id === "box-1");
      const box2 = viewEls.find((e) => e.id === "box-2");
      const arr1 = viewEls.find((e) => e.id === "arr-1");
      assert.equal(box1.strokeColor, "#ff0000");
      assert.equal(box2.strokeColor, "#000000");
      assert.equal(arr1.startBinding.elementId, "box-1");
      assert.equal(arr1.endBinding.elementId, "box-2");
    } finally {
      globalThis.ExcalidrawAutomate = prevEa;
    }
  });

  it("preserves existing elementsDict when updateElements adds new bound text to a shape", async () => {
    const env = createRealisticEaEnv([
      { id: "s1", type: "rectangle", x: 10, y: 20, width: 160, height: 80 },
      { id: "s2", type: "rectangle", x: 250, y: 20, width: 160, height: 80 },
    ]);
    const prevEa = globalThis.ExcalidrawAutomate;
    globalThis.ExcalidrawAutomate = env.ea;
    try {
      const adapter = new ObsidianEaAdapter(env.app, () => "active");
      const res = await adapter.updateElements({
        updates: [
          { id: "s1", text: "Added Label", fontSize: 18 },
          { id: "s2", x: 300 },
        ],
      });

      assert.deepEqual(res.updatedIds, ["s1", "s2"]);
      const viewEls = env.getViewElements();
      assert.equal(viewEls.length, 3);
      const s1 = viewEls.find((e) => e.id === "s1");
      const s2 = viewEls.find((e) => e.id === "s2");
      const boundText = viewEls.find((e) => e.type === "text" && e.containerId === "s1");
      assert.ok(boundText);
      assert.equal(boundText.text, "Added Label");
      assert.equal(boundText.fontSize, 18);
      assert.equal(s1.boundElements[0].id, boundText.id);
      assert.equal(s2.x, 300);
    } finally {
      globalThis.ExcalidrawAutomate = prevEa;
    }
  });
});
