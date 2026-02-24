import { Notice, Vault } from "obsidian";
import { Task, SyncState, PluginSettings } from "./types";
import { parseTasks, taskHash } from "./taskParser";
import * as cal from "./appleCalendar";

/**
 * One-directional sync: Obsidian is the single source of truth.
 * - [ ] task with @{date} → create/keep event in calendar
 * - [x] task or task removed → delete event from calendar
 * Calendar never modifies Obsidian files.
 */
export class SyncEngine {
  private vault: Vault;
  private settings: PluginSettings;
  private state: SyncState;
  private saveState: (state: SyncState) => Promise<void>;
  private syncing = false;

  constructor(
    vault: Vault,
    settings: PluginSettings,
    state: SyncState,
    saveState: (state: SyncState) => Promise<void>
  ) {
    this.vault = vault;
    this.settings = settings;
    this.state = state;
    this.saveState = saveState;
  }

  updateSettings(settings: PluginSettings) {
    this.settings = settings;
  }

  updateState(state: SyncState) {
    this.state = state;
  }

  async sync(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;

    try {
      const allTasks = await this.getAllTasks();
      const datedTasks = allTasks.filter((t) => t.date !== null);

      const taskMap = new Map<string, Task>();
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
      new Notice(`TodoSync: Sync error — ${(e as Error).message}`);
    } finally {
      this.syncing = false;
    }
  }

  private async pushToCalendar(taskMap: Map<string, Task>): Promise<void> {
    // 1. For each active (undone) dated task, ensure a calendar event exists
    for (const [hash, task] of taskMap) {
      if (task.done) {
        // If task is done and we were tracking it, delete the event
        const synced = this.state.syncedTasks[hash];
        if (synced) {
          try {
            await cal.deleteEvent(this.settings.calendarName, synced.calendarEventUid);
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
        // New undone task with date → create event
        try {
          const uid = await cal.createEvent(
            this.settings.calendarName,
            task.text,
            task.date!
          );
          this.state.syncedTasks[hash] = {
            taskHash: hash,
            text: task.text,
            date: task.date!,
            done: false,
            filePath: task.filePath,
            calendarEventUid: uid,
          };
          console.debug(`TodoSync: created event "${task.text}"`);
        } catch (e) {
          console.warn(`TodoSync: failed to create event for "${task.text}"`, e);
        }
        continue;
      }

      // Task exists and is tracked → check for updates
      const dateChanged = synced.date !== task.date;
      const fileChanged = synced.filePath !== task.filePath;
      if (dateChanged) {
        try {
          await cal.updateEvent(
            this.settings.calendarName,
            synced.calendarEventUid,
            undefined,
            task.date!
          );
          synced.date = task.date!;
          console.debug(`TodoSync: updated event date "${task.text}" → ${task.date}`);
        } catch (e) {
          console.warn(`TodoSync: failed to update event "${task.text}"`, e);
        }
      }
      if (fileChanged) {
        synced.filePath = task.filePath;
      }
    }

    // 2. Remove calendar events for tasks that no longer exist in the vault
    const staleHashes: string[] = [];
    for (const hash of Object.keys(this.state.syncedTasks)) {
      if (!taskMap.has(hash)) {
        staleHashes.push(hash);
      }
    }
    for (const hash of staleHashes) {
      const synced = this.state.syncedTasks[hash];
      try {
        await cal.deleteEvent(this.settings.calendarName, synced.calendarEventUid);
        console.debug(`TodoSync: deleted event "${synced.text}" (task removed from vault)`);
      } catch (e) {
        console.warn(`TodoSync: failed to delete stale event "${synced.text}"`, e);
      }
      delete this.state.syncedTasks[hash];
    }
  }

  private async getAllTasks(): Promise<Task[]> {
    const tasks: Task[] = [];
    const files = this.vault.getMarkdownFiles();

    for (const file of files) {
      if (!this.isWatched(file.path)) continue;
      const content = await this.vault.cachedRead(file);
      tasks.push(...parseTasks(content, file.path));
    }

    return tasks;
  }

  private isWatched(filePath: string): boolean {
    if (
      this.settings.watchedFolders.length === 0 ||
      (this.settings.watchedFolders.length === 1 && this.settings.watchedFolders[0] === "/")
    ) {
      return true;
    }
    return this.settings.watchedFolders.some((folder) => {
      const normalized = folder.startsWith("/") ? folder.slice(1) : folder;
      return filePath.startsWith(normalized);
    });
  }
}
