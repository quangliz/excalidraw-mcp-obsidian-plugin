import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeLayout } from "../src/shared/layout.ts";
import { validateVaultRelativePath } from "../src/shared/protocol.ts";

describe("analyzeLayout", () => {
  it("returns 0 warnings for a clean, non-overlapping connected diagram", () => {
    const elements = [
      {
        id: "frame-1",
        type: "frame",
        x: 0,
        y: 0,
        width: 700,
        height: 300,
      },
      {
        id: "box-a",
        type: "rectangle",
        x: 40,
        y: 80,
        width: 180,
        height: 80,
        frameId: "frame-1",
        boundElements: [
          { id: "text-a", type: "text" },
          { id: "arrow-1", type: "arrow" },
        ],
      },
      {
        id: "text-a",
        type: "text",
        x: 60,
        y: 105,
        width: 140,
        height: 25,
        fontSize: 20,
        text: "Client App",
        containerId: "box-a",
      },
      {
        id: "box-b",
        type: "rectangle",
        x: 340,
        y: 80,
        width: 180,
        height: 80,
        frameId: "frame-1",
        boundElements: [
          { id: "text-b", type: "text" },
          { id: "arrow-1", type: "arrow" },
        ],
      },
      {
        id: "text-b",
        type: "text",
        x: 360,
        y: 105,
        width: 140,
        height: 25,
        fontSize: 20,
        text: "API Server",
        containerId: "box-b",
      },
      {
        id: "arrow-1",
        type: "arrow",
        x: 220,
        y: 120,
        width: 120,
        height: 0,
        points: [
          [0, 0],
          [120, 0],
        ],
        startBinding: { elementId: "box-a" },
        endBinding: { elementId: "box-b" },
      },
    ];

    const warnings = analyzeLayout(elements);
    assert.deepEqual(warnings, []);
  });

  it("ignores deleted elements when checking overlaps and text overflow", () => {
    const elements = [
      {
        id: "box-1",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 150,
        height: 80,
      },
      {
        id: "box-deleted",
        type: "rectangle",
        x: 20,
        y: 10,
        width: 150,
        height: 80,
        isDeleted: true,
      },
      {
        id: "text-deleted",
        type: "text",
        x: -100,
        y: 0,
        width: 500,
        height: 200,
        text: "Deleted overflow",
        containerId: "box-1",
        isDeleted: true,
      },
    ];

    assert.deepEqual(analyzeLayout(elements), []);
  });

  describe("text_overflow", () => {
    it("flags bound text whose bounds exceed its container shape", () => {
      const elements = [
        {
          id: "box-1",
          type: "rectangle",
          x: 100,
          y: 100,
          width: 120,
          height: 50,
        },
        {
          id: "text-1",
          type: "text",
          x: 80,
          y: 105,
          width: 170,
          height: 40,
          fontSize: 20,
          text: "Too wide text",
          containerId: "box-1",
        },
      ];

      const warnings = analyzeLayout(elements);
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0].type, "text_overflow");
      assert.deepEqual(warnings[0].elementIds, ["text-1", "box-1"]);
    });

    it("flags bound text whose wrapped content overflows container height even if box width is small", () => {
      const elements = [
        {
          id: "box-1",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 120,
          height: 40,
        },
        {
          id: "text-1",
          type: "text",
          x: 10,
          y: 5,
          width: 100,
          height: 30,
          fontSize: 20,
          text: "Line 1\nLine 2\nLine 3\nLine 4",
          containerId: "box-1",
        },
      ];

      const warnings = analyzeLayout(elements);
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0].type, "text_overflow");
    });

    it("flags standalone text whose content exceeds its own bounding box", () => {
      const elements = [
        {
          id: "standalone-text",
          type: "text",
          x: 0,
          y: 0,
          width: 80,
          height: 25,
          fontSize: 20,
          text: "Supercalifragilisticexpialidocious",
        },
      ];

      const warnings = analyzeLayout(elements);
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0].type, "text_overflow");
      assert.deepEqual(warnings[0].elementIds, ["standalone-text"]);
    });
  });

  describe("shape_overlap", () => {
    it("flags colliding shapes that partially overlap", () => {
      const elements = [
        {
          id: "rect-1",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 150,
          height: 100,
        },
        {
          id: "ellipse-1",
          type: "ellipse",
          x: 100,
          y: 40,
          width: 150,
          height: 100,
        },
      ];

      const warnings = analyzeLayout(elements);
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0].type, "shape_overlap");
      assert.deepEqual(warnings[0].elementIds, ["rect-1", "ellipse-1"]);
    });

    it("ignores intentional containment when an outer shape encloses an inner shape", () => {
      const elements = [
        {
          id: "outer-box",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 400,
          height: 250,
        },
        {
          id: "inner-a",
          type: "rectangle",
          x: 30,
          y: 40,
          width: 140,
          height: 80,
        },
        {
          id: "inner-b",
          type: "diamond",
          x: 220,
          y: 40,
          width: 140,
          height: 80,
        },
      ];

      assert.deepEqual(analyzeLayout(elements), []);
    });

    it("ignores frames overlapping their child shapes", () => {
      const elements = [
        {
          id: "frame-1",
          type: "frame",
          x: 0,
          y: 0,
          width: 500,
          height: 300,
        },
        {
          id: "child-1",
          type: "rectangle",
          x: 40,
          y: 40,
          width: 120,
          height: 80,
          frameId: "frame-1",
        },
      ];

      assert.deepEqual(analyzeLayout(elements), []);
    });
  });

  describe("arrow_intersects_shape", () => {
    it("flags an arrow passing through an unrelated middle shape", () => {
      const elements = [
        {
          id: "start",
          type: "rectangle",
          x: 0,
          y: 50,
          width: 100,
          height: 60,
        },
        {
          id: "obstacle",
          type: "rectangle",
          x: 180,
          y: 30,
          width: 100,
          height: 100,
        },
        {
          id: "end",
          type: "rectangle",
          x: 360,
          y: 50,
          width: 100,
          height: 60,
        },
        {
          id: "arrow-1",
          type: "arrow",
          x: 100,
          y: 80,
          width: 260,
          height: 0,
          points: [
            [0, 0],
            [260, 0],
          ],
          startBinding: { elementId: "start" },
          endBinding: { elementId: "end" },
        },
      ];

      const warnings = analyzeLayout(elements);
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0].type, "arrow_intersects_shape");
      assert.deepEqual(warnings[0].elementIds, ["arrow-1", "obstacle"]);
    });

    it("does not flag an arrow traversing inside an enclosing container box", () => {
      const elements = [
        {
          id: "container",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 500,
          height: 200,
        },
        {
          id: "start",
          type: "rectangle",
          x: 30,
          y: 60,
          width: 120,
          height: 60,
        },
        {
          id: "end",
          type: "rectangle",
          x: 300,
          y: 60,
          width: 120,
          height: 60,
        },
        {
          id: "arrow-1",
          type: "arrow",
          x: 150,
          y: 90,
          width: 150,
          height: 0,
          points: [
            [0, 0],
            [150, 0],
          ],
          startBinding: { elementId: "start" },
          endBinding: { elementId: "end" },
        },
      ];

      assert.deepEqual(analyzeLayout(elements), []);
    });
  });

  describe("disconnected_arrow", () => {
    it("flags an arrow missing startBinding or endBinding", () => {
      const elements = [
        {
          id: "box-1",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 100,
          height: 60,
        },
        {
          id: "arrow-missing-end",
          type: "arrow",
          x: 100,
          y: 30,
          width: 120,
          height: 0,
          points: [
            [0, 0],
            [120, 0],
          ],
          startBinding: { elementId: "box-1" },
          endBinding: null,
        },
      ];

      const warnings = analyzeLayout(elements);
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0].type, "disconnected_arrow");
      assert.equal(warnings[0].severity, "warning");
      assert.deepEqual(warnings[0].elementIds, ["arrow-missing-end"]);
    });

    it("flags an arrow pointing to a deleted or non-existent target as error", () => {
      const elements = [
        {
          id: "box-1",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 100,
          height: 60,
        },
        {
          id: "box-2",
          type: "rectangle",
          x: 240,
          y: 0,
          width: 100,
          height: 60,
          isDeleted: true,
        },
        {
          id: "arrow-dangling",
          type: "arrow",
          x: 100,
          y: 30,
          width: 140,
          height: 0,
          points: [
            [0, 0],
            [140, 0],
          ],
          startBinding: { elementId: "box-1" },
          endBinding: { elementId: "box-2" },
        },
      ];

      const warnings = analyzeLayout(elements);
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0].type, "disconnected_arrow");
      assert.equal(warnings[0].severity, "error");
      assert.deepEqual(warnings[0].elementIds, ["arrow-dangling"]);
    });
  });
});

describe("validateVaultRelativePath", () => {
  it("accepts clean vault-relative paths", () => {
    assert.deepEqual(validateVaultRelativePath("Drawings/architecture.excalidraw.md"), {
      ok: true,
      path: "Drawings/architecture.excalidraw.md",
    });
    assert.deepEqual(validateVaultRelativePath("diagram.excalidraw"), {
      ok: true,
      path: "diagram.excalidraw",
    });
    assert.deepEqual(validateVaultRelativePath("a/b/c/my..note.excalidraw.md"), {
      ok: true,
      path: "a/b/c/my..note.excalidraw.md",
    });
  });

  it("rejects empty, whitespace-only, or padded paths", () => {
    assert.equal(validateVaultRelativePath("").ok, false);
    assert.equal(validateVaultRelativePath("   ").ok, false);
    assert.equal(validateVaultRelativePath(" Drawings/test.md").ok, false);
    assert.equal(validateVaultRelativePath("Drawings/test.md ").ok, false);
  });

  it("rejects leading slashes, trailing slashes, and double slashes", () => {
    assert.equal(validateVaultRelativePath("/Drawings/test.md").ok, false);
    assert.equal(validateVaultRelativePath("Drawings/").ok, false);
    assert.equal(validateVaultRelativePath("Drawings//test.md").ok, false);
  });

  it("rejects path traversal segments (. and ..)", () => {
    assert.equal(validateVaultRelativePath("../secret.md").ok, false);
    assert.equal(validateVaultRelativePath("Drawings/../secret.md").ok, false);
    assert.equal(validateVaultRelativePath("./Drawings/test.md").ok, false);
    assert.equal(validateVaultRelativePath("Drawings/.").ok, false);
  });

  it("rejects Windows drive letters, backslashes, null bytes, and URI schemes", () => {
    assert.equal(validateVaultRelativePath("C:\\vault\\test.md").ok, false);
    assert.equal(validateVaultRelativePath("C:/vault/test.md").ok, false);
    assert.equal(validateVaultRelativePath("Drawings\\test.md").ok, false);
    assert.equal(validateVaultRelativePath("Drawings/test.md\0.png").ok, false);
    assert.equal(validateVaultRelativePath("file:///etc/passwd").ok, false);
    assert.equal(validateVaultRelativePath("obsidian://open?vault=test").ok, false);
  });
});
