var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => TodoSyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/types.ts
var DEFAULT_SETTINGS = {
  calendarName: "Tasks",
  syncIntervalMinutes: 5,
  watchedFolders: ["/"]
};

// src/syncEngine.ts
var import_obsidian = require("obsidian");

// src/taskParser.ts
var import_crypto = require("crypto");
var TASK_REGEX = /^- \[([ x])\] (.+?)$/;
var DATE_REGEX = /@\{(\d{4}-\d{2}-\d{2})\}/;
function parseTasks(content, filePath) {
  const tasks = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const taskMatch = line.match(TASK_REGEX);
    if (!taskMatch) continue;
    const done = taskMatch[1] === "x";
    const body = taskMatch[2];
    const dateMatch = body.match(DATE_REGEX);
    tasks.push({
      text: body.replace(DATE_REGEX, "").trim(),
      done,
      date: dateMatch ? dateMatch[1] : null,
      filePath,
      line: i,
      rawLine: line
    });
  }
  return tasks;
}
function taskHash(text) {
  const normalized = text.toLowerCase().trim();
  return (0, import_crypto.createHash)("md5").update(normalized).digest("hex").slice(0, 12);
}

// src/appleCalendar.ts
var import_child_process = require("child_process");
function runJxa(script) {
  return new Promise((resolve, reject) => {
    const escaped = script.replace(/'/g, "'\\''");
    (0, import_child_process.exec)(
      `osascript -l JavaScript -e '${escaped}'`,
      { timeout: 15e3 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`JXA error: ${error.message}
stderr: ${stderr}`));
        } else {
          resolve(stdout.trim());
        }
      }
    );
  });
}
async function createEvent(calendarName, summary, dateStr) {
  const script = `
    (() => {
      const app = Application('Calendar');
      const cals = app.calendars.whose({name: '${escapeJxa(calendarName)}'});
      if (cals.length === 0) throw new Error('Calendar not found: ${escapeJxa(calendarName)}');
      const cal = cals[0];
      const start = new Date('${dateStr}T00:00:00');
      const end = new Date('${dateStr}T23:59:59');
      const evt = app.Event({
        summary: '${escapeJxa(summary)}',
        startDate: start,
        endDate: end,
        alldayEvent: true
      });
      cal.events.push(evt);
      return evt.uid();
    })()
  `;
  return await runJxa(script);
}
async function updateEvent(calendarName, uid, summary, dateStr) {
  const setParts = [];
  if (summary !== void 0) {
    setParts.push(`evt.summary = '${escapeJxa(summary)}';`);
  }
  if (dateStr !== void 0) {
    setParts.push(`evt.startDate = new Date('${dateStr}T00:00:00');`);
    setParts.push(`evt.endDate = new Date('${dateStr}T23:59:59');`);
  }
  if (setParts.length === 0) return;
  const script = `
    (() => {
      const app = Application('Calendar');
      const cal = app.calendars.whose({name: '${escapeJxa(calendarName)}'})[0];
      const evts = cal.events.whose({uid: '${escapeJxa(uid)}'});
      if (evts.length === 0) return 'not_found';
      const evt = evts[0];
      ${setParts.join("\n      ")}
      return 'ok';
    })()
  `;
  await runJxa(script);
}
async function deleteEvent(calendarName, uid) {
  const script = `
    (() => {
      const app = Application('Calendar');
      const cal = app.calendars.whose({name: '${escapeJxa(calendarName)}'})[0];
      const evts = cal.events.whose({uid: '${escapeJxa(uid)}'});
      if (evts.length === 0) return 'not_found';
      app.delete(evts[0]);
      return 'ok';
    })()
  `;
  await runJxa(script);
}
function escapeJxa(str) {
  return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// src/syncEngine.ts
var SyncEngine = class {
  constructor(vault, settings, state, saveState) {
    this.syncing = false;
    this.vault = vault;
    this.settings = settings;
    this.state = state;
    this.saveState = saveState;
  }
  updateSettings(settings) {
    this.settings = settings;
  }
  updateState(state) {
    this.state = state;
  }
  async sync() {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const allTasks = await this.getAllTasks();
      const datedTasks = allTasks.filter((t) => t.date !== null);
      const taskMap = /* @__PURE__ */ new Map();
      for (const t of datedTasks) {
        const hash = taskHash(t.text);
        if (!taskMap.has(hash)) {
          taskMap.set(hash, t);
        }
      }
      await this.pushToCalendar(taskMap);
      await this.saveState(this.state);
    } catch (e) {
      console.warn("TodoSync: sync error", e);
      new import_obsidian.Notice(`TodoSync: Sync error \u2014 ${e.message}`);
    } finally {
      this.syncing = false;
    }
  }
  async pushToCalendar(taskMap) {
    for (const [hash, task] of taskMap) {
      if (task.done) {
        const synced2 = this.state.syncedTasks[hash];
        if (synced2) {
          try {
            await deleteEvent(this.settings.calendarName, synced2.calendarEventUid);
            console.debug(`TodoSync: deleted event "${task.text}" (task completed)`);
          } catch (e) {
            console.warn(`TodoSync: failed to delete event "${task.text}"`, e);
          }
          delete this.state.syncedTasks[hash];
        }
        continue;
      }
      const synced = this.state.syncedTasks[hash];
      if (!synced) {
        try {
          const uid = await createEvent(
            this.settings.calendarName,
            task.text,
            task.date
          );
          this.state.syncedTasks[hash] = {
            taskHash: hash,
            text: task.text,
            date: task.date,
            done: false,
            filePath: task.filePath,
            calendarEventUid: uid
          };
          console.debug(`TodoSync: created event "${task.text}"`);
        } catch (e) {
          console.warn(`TodoSync: failed to create event for "${task.text}"`, e);
        }
        continue;
      }
      const dateChanged = synced.date !== task.date;
      const fileChanged = synced.filePath !== task.filePath;
      if (dateChanged) {
        try {
          await updateEvent(
            this.settings.calendarName,
            synced.calendarEventUid,
            void 0,
            task.date
          );
          synced.date = task.date;
          console.debug(`TodoSync: updated event date "${task.text}" \u2192 ${task.date}`);
        } catch (e) {
          console.warn(`TodoSync: failed to update event "${task.text}"`, e);
        }
      }
      if (fileChanged) {
        synced.filePath = task.filePath;
      }
    }
    const staleHashes = [];
    for (const hash of Object.keys(this.state.syncedTasks)) {
      if (!taskMap.has(hash)) {
        staleHashes.push(hash);
      }
    }
    for (const hash of staleHashes) {
      const synced = this.state.syncedTasks[hash];
      try {
        await deleteEvent(this.settings.calendarName, synced.calendarEventUid);
        console.debug(`TodoSync: deleted event "${synced.text}" (task removed from vault)`);
      } catch (e) {
        console.warn(`TodoSync: failed to delete stale event "${synced.text}"`, e);
      }
      delete this.state.syncedTasks[hash];
    }
  }
  async getAllTasks() {
    const tasks = [];
    const files = this.vault.getMarkdownFiles();
    for (const file of files) {
      if (!this.isWatched(file.path)) continue;
      const content = await this.vault.cachedRead(file);
      tasks.push(...parseTasks(content, file.path));
    }
    return tasks;
  }
  isWatched(filePath) {
    if (this.settings.watchedFolders.length === 0 || this.settings.watchedFolders.length === 1 && this.settings.watchedFolders[0] === "/") {
      return true;
    }
    return this.settings.watchedFolders.some((folder) => {
      const normalized = folder.startsWith("/") ? folder.slice(1) : folder;
      return filePath.startsWith(normalized);
    });
  }
};

// src/settings.ts
var import_obsidian2 = require("obsidian");
var TodoSyncSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian2.Setting(containerEl).setName("Calendar name").setDesc("Name of the Apple Calendar to sync with").addText(
      (text) => text.setPlaceholder("Tasks").setValue(this.plugin.settings.calendarName).onChange(async (value) => {
        this.plugin.settings.calendarName = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Sync interval (minutes)").setDesc("How often to re-sync to Apple Calendar (0 to disable periodic sync)").addText(
      (text) => text.setPlaceholder("5").setValue(String(this.plugin.settings.syncIntervalMinutes)).onChange(async (value) => {
        const num = parseInt(value, 10);
        if (!isNaN(num) && num >= 0) {
          this.plugin.settings.syncIntervalMinutes = num;
          await this.plugin.saveSettings();
          this.plugin.restartSyncInterval();
        }
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Watched folders").setDesc(
      'Comma-separated list of vault folders to scan for tasks. Use "/" to watch the entire vault.'
    ).addText(
      (text) => text.setPlaceholder("/").setValue(this.plugin.settings.watchedFolders.join(", ")).onChange(async (value) => {
        this.plugin.settings.watchedFolders = value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
        await this.plugin.saveSettings();
      })
    );
  }
};

// src/main.ts
var TodoSyncPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.intervalId = null;
    this.fileChangeTimer = null;
  }
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
      new import_obsidian3.Notice("TodoSync: Syncing\u2026");
      await this.syncEngine.sync();
      new import_obsidian3.Notice("TodoSync: Done");
    });
    this.addCommand({
      id: "todosync-sync-now",
      name: "Sync now",
      callback: async () => {
        new import_obsidian3.Notice("TodoSync: Syncing\u2026");
        await this.syncEngine.sync();
        new import_obsidian3.Notice("TodoSync: Done");
      }
    });
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof import_obsidian3.TFile && file.extension === "md") {
          this.debouncedSync();
        }
      })
    );
    this.restartSyncInterval();
    this.app.workspace.onLayoutReady(() => {
      setTimeout(() => this.syncEngine.sync(), 3e3);
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
        minutes * 60 * 1e3
      );
    }
  }
  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data == null ? void 0 : data.settings);
  }
  async saveSettings() {
    var _a;
    const data = await this.loadData() || {};
    data.settings = this.settings;
    await this.saveData(data);
    (_a = this.syncEngine) == null ? void 0 : _a.updateSettings(this.settings);
  }
  async loadSyncState() {
    const data = await this.loadData();
    return (data == null ? void 0 : data.syncState) || { syncedTasks: {} };
  }
  async saveSyncState(state) {
    const data = await this.loadData() || {};
    data.syncState = state;
    await this.saveData(data);
  }
  debouncedSync() {
    if (this.fileChangeTimer !== null) {
      window.clearTimeout(this.fileChangeTimer);
    }
    this.fileChangeTimer = window.setTimeout(() => {
      this.fileChangeTimer = null;
      this.syncEngine.sync();
    }, 2e3);
  }
};
