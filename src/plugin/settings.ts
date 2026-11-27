import { randomBytes } from "node:crypto";
import {
  Notice,
  Plugin,
  PluginSettingTab,
  requireApiVersion,
  Setting,
  type App,
  type SettingDefinitionItem,
} from "obsidian";
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

interface SettingRow {
  name: string;
  desc: string;
  render: (setting: Setting) => void;
}

export class ExcalidrawMcpSettingTab extends PluginSettingTab {
  private readonly plugin: ExcalidrawMcpPluginLike;

  constructor(app: App, plugin: ExcalidrawMcpPluginLike) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /** Obsidian 1.13+ declarative settings API (also powers settings search). */
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: "group",
        heading: "Excalidraw MCP bridge",
        items: this.getRows(),
      },
    ];
  }

  /** Obsidian before 1.13 calls display() instead of getSettingDefinitions(). */
  display(): void {
    this.renderLegacy();
  }

  private renderLegacy(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Excalidraw MCP bridge").setHeading();
    for (const row of this.getRows()) {
      row.render(new Setting(containerEl).setName(row.name).setDesc(row.desc));
    }
  }

  private refresh(): void {
    if (requireApiVersion("1.13.0")) {
      this.update();
    } else {
      this.renderLegacy();
    }
  }

  private getRows(): SettingRow[] {
    const status = this.plugin.getBridgeStatus();
    const statusText = status.running
      ? `Running on http://${status.host}:${status.port}`
      : status.error
        ? `Stopped (error: ${status.error})`
        : "Stopped";

    return [
      {
        name: "Bridge status",
        desc: statusText,
        render: (setting) => {
          setting
            .addButton((btn) =>
              btn
                .setButtonText(status.running ? "Stop" : "Start")
                .onClick(async () => {
                  if (status.running) {
                    await this.plugin.stopBridge();
                  } else {
                    await this.plugin.startBridge();
                  }
                  this.refresh();
                }),
            )
            .addButton((btn) =>
              btn
                .setButtonText("Restart")
                .setCta()
                .onClick(async () => {
                  await this.plugin.restartBridge();
                  this.refresh();
                }),
            );
        },
      },
      {
        name: "Bridge port",
        desc: `Localhost (${DEFAULT_BRIDGE_HOST}) port for the MCP HTTP bridge. Default: ${DEFAULT_BRIDGE_PORT}.`,
        render: (setting) => {
          setting.addText((text) => {
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
        },
      },
      {
        name: "Bearer auth token",
        desc: "Optional shared secret. When set, HTTP bridge requests require Authorization: Bearer <token>.",
        render: (setting) => {
          setting
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
                this.refresh();
              }),
            )
            .addButton((btn) =>
              btn.setButtonText("Clear").onClick(async () => {
                this.plugin.settings.authToken = "";
                await this.plugin.saveSettings();
                this.refresh();
              }),
            );
        },
      },
      {
        name: "Default target view",
        desc: "Which open Excalidraw drawing to target when filePath is omitted.",
        render: (setting) => {
          setting.addDropdown((dropdown) =>
            dropdown
              .addOption("active", "Active (or last active) Excalidraw view")
              .addOption("first", "First open Excalidraw view")
              .setValue(this.plugin.settings.defaultViewTarget)
              .onChange(async (value) => {
                this.plugin.settings.defaultViewTarget = value === "first" ? "first" : "active";
                await this.plugin.saveSettings();
              }),
          );
        },
      },
      {
        name: "Auto-start bridge",
        desc: "Automatically start the local HTTP bridge when Obsidian finishes loading.",
        render: (setting) => {
          setting.addToggle((toggle) =>
            toggle.setValue(this.plugin.settings.autoStart).onChange(async (value) => {
              this.plugin.settings.autoStart = value;
              await this.plugin.saveSettings();
            }),
          );
        },
      },
    ];
  }
}
