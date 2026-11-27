import { randomBytes } from "node:crypto";
import { Notice, Plugin, PluginSettingTab, Setting, type App } from "obsidian";
import { DEFAULT_BRIDGE_HOST, DEFAULT_BRIDGE_PORT } from "../shared/protocol.ts";

export type ViewTargetMode = "active" | "first";

export interface ExcalidrawMcpSettings {
  port: number;
  authToken: string;
  defaultViewTarget: ViewTargetMode;
  autoStart: boolean;
}

export const DEFAULT_SETTINGS: ExcalidrawMcpSettings = {
  port: DEFAULT_BRIDGE_PORT,
  authToken: "",
  defaultViewTarget: "active",
  autoStart: true,
};

export interface BridgeRuntimeStatus {
  running: boolean;
  host: string;
  port: number;
  error?: string;
}

export interface ExcalidrawMcpPluginLike extends Plugin {
  settings: ExcalidrawMcpSettings;
  saveSettings(): Promise<void>;
  startBridge(): Promise<void>;
  stopBridge(): Promise<void>;
  restartBridge(): Promise<void>;
  getBridgeStatus(): BridgeRuntimeStatus;
}

export function normalizePort(value: unknown, fallback = DEFAULT_BRIDGE_PORT): number {
  const num = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (Number.isInteger(num) && num >= 1 && num <= 65535) {
    return num;
  }
  return fallback;
}

export function generateAuthToken(): string {
  return randomBytes(24).toString("hex");
}

export class ExcalidrawMcpSettingTab extends PluginSettingTab {
  private readonly plugin: ExcalidrawMcpPluginLike;

  constructor(app: App, plugin: ExcalidrawMcpPluginLike) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Obsidian Excalidraw MCP Bridge" });

    const status = this.plugin.getBridgeStatus();
    const statusText = status.running
      ? `Running on http://${status.host}:${status.port}`
      : status.error
        ? `Stopped (error: ${status.error})`
        : "Stopped";

    new Setting(containerEl)
      .setName("Bridge status")
      .setDesc(statusText)
      .addButton((btn) =>
        btn
          .setButtonText(status.running ? "Stop" : "Start")
          .onClick(async () => {
            if (status.running) {
              await this.plugin.stopBridge();
            } else {
              await this.plugin.startBridge();
            }
            this.display();
          }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Restart")
          .setCta()
          .onClick(async () => {
            await this.plugin.restartBridge();
            this.display();
          }),
      );

    new Setting(containerEl)
      .setName("Bridge port")
      .setDesc(
        `Localhost (${DEFAULT_BRIDGE_HOST}) port for the MCP HTTP bridge. Default: ${DEFAULT_BRIDGE_PORT}.`,
      )
      .addText((text) => {
        text
          .setPlaceholder(String(DEFAULT_BRIDGE_PORT))
          .setValue(String(this.plugin.settings.port))
          .onChange(async (raw) => {
            const parsed = Number.parseInt(raw.trim(), 10);
            if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
              return;
            }
            this.plugin.settings.port = parsed;
            await this.plugin.saveSettings();
          });
        text.inputEl.addEventListener("blur", () => {
          const parsed = Number.parseInt(text.getValue().trim(), 10);
          if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
            new Notice("Port must be an integer between 1 and 65535.");
            text.setValue(String(this.plugin.settings.port));
          }
        });
      });

    new Setting(containerEl)
      .setName("Bearer auth token")
      .setDesc(
        "Optional shared secret. When set, POST /rpc and POST /action/* require Authorization: Bearer <token>.",
      )
      .addText((text) => {
        text
          .setPlaceholder("Leave empty to disable auth")
          .setValue(this.plugin.settings.authToken)
          .onChange(async (value) => {
            this.plugin.settings.authToken = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = "password";
      })
      .addButton((btn) =>
        btn.setButtonText("Generate").onClick(async () => {
          this.plugin.settings.authToken = generateAuthToken();
          await this.plugin.saveSettings();
          new Notice("Generated new Bearer auth token.");
          this.display();
        }),
      )
      .addButton((btn) =>
        btn.setButtonText("Clear").onClick(async () => {
          this.plugin.settings.authToken = "";
          await this.plugin.saveSettings();
          this.display();
        }),
      );

    new Setting(containerEl)
      .setName("Default target view")
      .setDesc("Which open Excalidraw drawing to target when filePath is omitted.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("active", "Active (or last active) Excalidraw view")
          .addOption("first", "First open Excalidraw view")
          .setValue(this.plugin.settings.defaultViewTarget)
          .onChange(async (value) => {
            this.plugin.settings.defaultViewTarget = value === "first" ? "first" : "active";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Auto-start bridge")
      .setDesc("Automatically start the local HTTP bridge when Obsidian finishes loading.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoStart).onChange(async (value) => {
          this.plugin.settings.autoStart = value;
          await this.plugin.saveSettings();
        }),
      );
  }
}
