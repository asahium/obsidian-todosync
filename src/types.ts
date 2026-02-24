export interface Task {
  text: string;
  done: boolean;
  date: string | null; // YYYY-MM-DD or null if no deadline
  filePath: string;
  line: number;
  rawLine: string;
}

export interface SyncedTask {
  taskHash: string;
  text: string;
  date: string;
  done: boolean;
  filePath: string;
  calendarEventUid: string;
}

export interface SyncState {
  syncedTasks: Record<string, SyncedTask>; // key = taskHash
}

export interface CalendarEvent {
  uid: string;
  summary: string;
  startDate: string; // YYYY-MM-DD
}

export interface PluginSettings {
  calendarName: string;
  syncIntervalMinutes: number;
  watchedFolders: string[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
  calendarName: "Tasks",
  syncIntervalMinutes: 5,
  watchedFolders: ["/"],
};
