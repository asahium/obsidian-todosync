import { Notice, Plugin, TFile } from "obsidian";
import { PluginSettings, SyncState, DEFAULT_SETTINGS } from "./types";
import { SyncEngine } from "./syncEngine";
import { TodoSyncSettingTab } from "./settings";

export default class TodoSyncPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  private syncEngine!: SyncEngine;
  private intervalId: number | null = null;
  private fileChangeTimer: number | null = null;

  async onload() {
    await this.loadSettings();
    const state = await this.loadSyncState();

    this.syncEngine = new SyncEngine(
      this.app.vault,
      this.settings,
      state,
      (s) => this.saveSyncState(s)
    );

    this.addSettingTab(new TodoSyncSettingTab(this.app, this));

    this.addRibbonIcon("refresh-cw", "TodoSync: Sync now", async () => {
      new Notice("TodoSync: Syncing…");
      await this.syncEngine.sync();
      new Notice("TodoSync: Done");
    });

    this.addCommand({
      id: "todosync-sync-now",
      name: "Sync now",
      callback: async () => {
        new Notice("TodoSync: Syncing…");
        await this.syncEngine.sync();
        new Notice("TodoSync: Done");
      },
    });

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.debouncedSync();
        }
      })
    );

    this.restartSyncInterval();

    this.app.workspace.onLayoutReady(() => {
      setTimeout(() => this.syncEngine.sync(), 3000);
    });
  }

  onunload() {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
    }
    if (this.fileChangeTimer !== null) {
      window.clearTimeout(this.fileChangeTimer);
    }
  }

  restartSyncInterval() {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const minutes = this.settings.syncIntervalMinutes;
    if (minutes > 0) {
      this.intervalId = window.setInterval(
        () => this.syncEngine.sync(),
        minutes * 60 * 1000
      );
    }
  }

  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings);
  }

  async saveSettings() {
    const data = (await this.loadData()) || {};
    data.settings = this.settings;
    await this.saveData(data);
    this.syncEngine?.updateSettings(this.settings);
  }

  private async loadSyncState(): Promise<SyncState> {
    const data = await this.loadData();
    return data?.syncState || { syncedTasks: {} };
  }

  private async saveSyncState(state: SyncState): Promise<void> {
    const data = (await this.loadData()) || {};
    data.syncState = state;
    await this.saveData(data);
  }

  private debouncedSync() {
    if (this.fileChangeTimer !== null) {
      window.clearTimeout(this.fileChangeTimer);
    }
    this.fileChangeTimer = window.setTimeout(() => {
      this.fileChangeTimer = null;
      this.syncEngine.sync();
    }, 2000);
  }
}
