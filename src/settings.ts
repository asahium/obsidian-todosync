import { App, PluginSettingTab, Setting } from "obsidian";
import type TodoSyncPlugin from "./main";

export class TodoSyncSettingTab extends PluginSettingTab {
  plugin: TodoSyncPlugin;

  constructor(app: App, plugin: TodoSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Calendar name")
      .setDesc("Name of the Apple Calendar to sync with")
      .addText((text) =>
        text
          .setPlaceholder("Tasks")
          .setValue(this.plugin.settings.calendarName)
          .onChange(async (value) => {
            this.plugin.settings.calendarName = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sync interval (minutes)")
      .setDesc("How often to re-sync to Apple Calendar (0 to disable periodic sync)")
      .addText((text) =>
        text
          .setPlaceholder("5")
          .setValue(String(this.plugin.settings.syncIntervalMinutes))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 0) {
              this.plugin.settings.syncIntervalMinutes = num;
              await this.plugin.saveSettings();
              this.plugin.restartSyncInterval();
            }
          })
      );

    new Setting(containerEl)
      .setName("Watched folders")
      .setDesc(
        'Comma-separated list of vault folders to scan for tasks. Use "/" to watch the entire vault.'
      )
      .addText((text) =>
        text
          .setPlaceholder("/")
          .setValue(this.plugin.settings.watchedFolders.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.watchedFolders = value
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          })
      );
  }
}
