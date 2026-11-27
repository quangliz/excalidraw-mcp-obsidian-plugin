import esbuild from "esbuild";
import { existsSync, chmodSync, mkdirSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const pluginOnly = args.has("--plugin-only");
const mcpOnly = args.has("--mcp-only");

if (pluginOnly && mcpOnly) {
  console.error("Cannot specify both --plugin-only and --mcp-only.");
  process.exit(1);
}

const nodeBuiltins = Array.from(
  new Set([
    ...builtinModules,
    ...builtinModules.map((mod) => `node:${mod}`),
    "node:*",
  ]),
);

const pluginEntry = path.resolve("src/plugin/main.ts");
const mcpEntry = path.resolve("src/mcp/index.ts");

const buildPlugin = async () => {
  if (!existsSync(pluginEntry)) {
    throw new Error(`Plugin entrypoint not found: ${pluginEntry}`);
  }
  mkdirSync(path.resolve("dist/plugin"), { recursive: true });
  await esbuild.build({
    entryPoints: [pluginEntry],
    outfile: path.resolve("dist/plugin/main.js"),
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "es2022",
    sourcemap: false,
    logLevel: "info",
    external: [
      "obsidian",
      "electron",
      "@codemirror/*",
      "@lezer/*",
      ...nodeBuiltins,
    ],
  });
};

const buildMcp = async () => {
  if (!existsSync(mcpEntry)) {
    throw new Error(`MCP entrypoint not found: ${mcpEntry}`);
  }
  const outfile = path.resolve("dist/mcp/server.js");
  mkdirSync(path.dirname(outfile), { recursive: true });
  await esbuild.build({
    entryPoints: [mcpEntry],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2022",
    sourcemap: false,
    logLevel: "info",
    banner: {
      js: [
        "#!/usr/bin/env node",
        'import { createRequire as __bundleCreateRequire } from "node:module";',
        "const require = __bundleCreateRequire(import.meta.url);",
      ].join("\n"),
    },
    external: nodeBuiltins,
  });
  chmodSync(outfile, 0o755);
};

async function main() {
  if (pluginOnly) {
    await buildPlugin();
    return;
  }
  if (mcpOnly) {
    await buildMcp();
    return;
  }

  const hasPlugin = existsSync(pluginEntry);
  const hasMcp = existsSync(mcpEntry);

  if (!hasPlugin && !hasMcp) {
    console.log("No entrypoints found (src/plugin/main.ts or src/mcp/index.ts). Skipping build.");
    return;
  }

  if (hasPlugin) {
    await buildPlugin();
  } else {
    console.log("Skipping plugin build: src/plugin/main.ts not found.");
  }

  if (hasMcp) {
    await buildMcp();
  } else {
    console.log("Skipping MCP build: src/mcp/index.ts not found.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
