import { Notice, Plugin } from "obsidian";
import { DEFAULT_BRIDGE_HOST } from "../shared/protocol.ts";
import { BridgeServer } from "./bridge-server.ts";
import { ObsidianEaAdapter } from "./ea-adapter.ts";
import { createBridgeHandlers } from "./handlers.ts";
import {
  DEFAULT_SETTINGS,
  ExcalidrawMcpSettingTab,
  normalizePort,
  type BridgeRuntimeStatus,
  type ExcalidrawMcpPluginLike,
  type ExcalidrawMcpSettings,
} from "./settings.ts";

export default class ObsidianExcalidrawMcpPlugin
  extends Plugin
  implements ExcalidrawMcpPluginLike
{
  settings: ExcalidrawMcpSettings = { ...DEFAULT_SETTINGS };
  private adapter: ObsidianEaAdapter | null = null;
  private bridgeServer: BridgeServer | null = null;
  private statusBarEl: HTMLElement | null = null;
  private lastError: string | undefined;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.adapter = new ObsidianEaAdapter(this.app, () => this.settings.defaultViewTarget);
    const handlers = createBridgeHandlers(this.adapter);

    this.bridgeServer = new BridgeServer({
      port: this.settings.port,
      getAuthToken: () => this.settings.authToken,
      handlers,
      adapter: this.adapter,
      version: this.manifest.version,
    });

    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.addClass("excalidraw-mcp-status");
    this.statusBarEl.addEventListener("click", () => {
      void this.toggleBridge();
    });
    this.updateStatusBar();

    this.addSettingTab(new ExcalidrawMcpSettingTab(this.app, this));

    this.addCommand({
      id: "toggle-excalidraw-mcp-bridge",
      name: "Toggle Excalidraw MCP Bridge",
      callback: () => {
        void this.toggleBridge();
      },
    });

    this.addCommand({
      id: "restart-excalidraw-mcp-bridge",
      name: "Restart Excalidraw MCP Bridge",
      callback: () => {
        void this.restartBridge();
      },
    });

    this.app.workspace.onLayoutReady(() => {
      if (this.settings.autoStart) {
        void this.startBridge();
      }
    });
  }

  onunload(): void {
    void this.stopBridge();
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<ExcalidrawMcpSettings> | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(loaded ?? {}),
      port: normalizePort(loaded?.port, DEFAULT_SETTINGS.port),
      authToken: typeof loaded?.authToken === "string" ? loaded.authToken : "",
      defaultViewTarget: loaded?.defaultViewTarget === "first" ? "first" : "active",
      autoStart: loaded?.autoStart ?? DEFAULT_SETTINGS.autoStart,
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  getBridgeStatus(): BridgeRuntimeStatus {
    const addr = this.bridgeServer?.getAddress();
    return {
      running: Boolean(this.bridgeServer?.isRunning()),
      host: addr?.host ?? DEFAULT_BRIDGE_HOST,
      port: addr?.port ?? this.settings.port,
      error: this.lastError,
    };
  }

  getAntidianMcpServer(): {
    name: string;
    url: string;
    headers?: Array<{ name: string; value: string }>;
    description?: string;
    version?: string;
  } | null {
    const addr = this.bridgeServer?.getAddress();
    if (!this.bridgeServer?.isRunning() || !addr) {
      return null;
    }
    const token = this.settings.authToken.trim();
    return {
      name: "excalidraw",
      url: `http://${addr.host}:${addr.port}/mcp`,
      ...(token
        ? { headers: [{ name: "Authorization", value: `Bearer ${token}` }] }
        : {}),
      description: this.manifest.description,
      version: this.manifest.version,
    };
  }

  async startBridge(): Promise<void> {
    if (!this.adapter) return;
    if (this.bridgeServer?.isRunning()) return;

    this.lastError = undefined;
    this.bridgeServer = new BridgeServer({
      port: this.settings.port,
      getAuthToken: () => this.settings.authToken,
      handlers: createBridgeHandlers(this.adapter),
      adapter: this.adapter,
      version: this.manifest.version,
    });

    try {
      const addr = await this.bridgeServer.start();
      new Notice(`Excalidraw MCP Bridge listening on http://${addr.host}:${addr.port}`);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      new Notice(`Excalidraw MCP Bridge failed to start: ${this.lastError}`);
    } finally {
      this.updateStatusBar();
    }
  }

  async stopBridge(): Promise<void> {
    if (!this.bridgeServer) return;
    try {
      await this.bridgeServer.stop();
    } finally {
      this.updateStatusBar();
    }
  }

  async restartBridge(): Promise<void> {
    await this.stopBridge();
    await this.startBridge();
  }

  private async toggleBridge(): Promise<void> {
    if (this.bridgeServer?.isRunning()) {
      await this.stopBridge();
      new Notice("Excalidraw MCP Bridge stopped.");
    } else {
      await this.startBridge();
    }
  }

  private updateStatusBar(): void {
    if (!this.statusBarEl) return;
    const status = this.getBridgeStatus();
    if (status.running) {
      this.statusBarEl.setText(`Excalidraw MCP :${status.port}`);
      this.statusBarEl.setAttribute(
        "aria-label",
        `Excalidraw MCP Bridge running on ${status.host}:${status.port} (click to stop)`,
      );
    } else {
      this.statusBarEl.setText("Excalidraw MCP (off)");
      this.statusBarEl.setAttribute(
        "aria-label",
        status.error
          ? `Excalidraw MCP Bridge stopped: ${status.error}`
          : "Excalidraw MCP Bridge stopped (click to start)",
      );
    }
  }
}
