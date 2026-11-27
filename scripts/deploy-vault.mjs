#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ID = "excalidraw-mcp-antidian";

function printUsage() {
  console.log(
    [
      "Usage: node scripts/deploy-vault.mjs [options]",
      "",
      "Options:",
      "  --vault <path>   Obsidian vault root (or set OBSIDIAN_VAULT_PATH)",
      "  --dry-run        Print planned copy operations without writing files",
      "  -h, --help       Show this help message",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  let vaultPath = process.env.OBSIDIAN_VAULT_PATH || "";
  let dryRun = false;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "-h" || arg === "--help") {
      help = true;
    } else if (arg === "--vault") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        throw new Error("Missing value for --vault <path>.");
      }
      vaultPath = next;
      i += 1;
    } else if (arg.startsWith("--vault=")) {
      vaultPath = arg.slice("--vault=".length);
      if (!vaultPath) {
        throw new Error("Missing value for --vault=<path>.");
      }
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { vaultPath, dryRun, help };
}

function main() {
  const { vaultPath, dryRun, help } = parseArgs(process.argv.slice(2));
  if (help) {
    printUsage();
    return;
  }

  if (!vaultPath) {
    throw new Error("Missing vault path. Pass --vault <path> or set OBSIDIAN_VAULT_PATH.");
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "..");
  const resolvedVault = path.resolve(vaultPath);
  const targetDir = path.join(resolvedVault, ".obsidian", "plugins", PLUGIN_ID);

  const files = [
    { src: path.join(repoRoot, "manifest.json"), destName: "manifest.json", requiredForDryRun: true },
    { src: path.join(repoRoot, "styles.css"), destName: "styles.css", requiredForDryRun: true },
    { src: path.join(repoRoot, "versions.json"), destName: "versions.json", requiredForDryRun: true },
    {
      src: path.join(repoRoot, "dist", "plugin", "main.js"),
      destName: "main.js",
      requiredForDryRun: false,
      buildHint: "dist/plugin/main.js is not built yet. Run 'npm run build' (or 'node esbuild.config.mjs --plugin-only') first.",
    },
  ];

  const missingStatic = files.filter((f) => f.requiredForDryRun && !existsSync(f.src));
  if (missingStatic.length > 0) {
    throw new Error(
      `Missing required plugin files: ${missingStatic.map((f) => f.src).join(", ")}`,
    );
  }

  const missingBuild = files.filter((f) => !f.requiredForDryRun && !existsSync(f.src));
  if (!dryRun && missingBuild.length > 0) {
    throw new Error(missingBuild[0].buildHint || `Missing built file: ${missingBuild[0].src}`);
  }

  if (dryRun) {
    console.log(`[dry-run] Target plugin directory: ${targetDir}`);
    for (const file of files) {
      const dest = path.join(targetDir, file.destName);
      const status = existsSync(file.src) ? "ready" : "missing (run npm run build)";
      console.log(`[dry-run] ${file.src} -> ${dest} [${status}]`);
    }
    return;
  }

  if (!existsSync(resolvedVault)) {
    throw new Error(`Vault path does not exist: ${resolvedVault}`);
  }

  mkdirSync(targetDir, { recursive: true });
  for (const file of files) {
    const dest = path.join(targetDir, file.destName);
    copyFileSync(file.src, dest);
    console.log(`Copied ${path.relative(repoRoot, file.src)} -> ${dest}`);
  }
  console.log(`Deployed ${PLUGIN_ID} to ${targetDir}`);
}

try {
  main();
} catch (err) {
  console.error(`Deploy error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
