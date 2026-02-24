import { exec } from "child_process";
import { CalendarEvent } from "./types";

function runJxa(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const escaped = script.replace(/'/g, "'\\''");
    exec(
      `osascript -l JavaScript -e '${escaped}'`,
      { timeout: 15000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`JXA error: ${error.message}\nstderr: ${stderr}`));
        } else {
          resolve(stdout.trim());
        }
      }
    );
  });
}

export async function createEvent(
  calendarName: string,
  summary: string,
  dateStr: string
): Promise<string> {
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

export async function updateEvent(
  calendarName: string,
  uid: string,
  summary?: string,
  dateStr?: string
): Promise<void> {
  const setParts: string[] = [];
  if (summary !== undefined) {
    setParts.push(`evt.summary = '${escapeJxa(summary)}';`);
  }
  if (dateStr !== undefined) {
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

export async function deleteEvent(
  calendarName: string,
  uid: string
): Promise<void> {
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

export async function listEvents(
  calendarName: string
): Promise<CalendarEvent[]> {
  const script = `
    (() => {
      const app = Application('Calendar');
      const cals = app.calendars.whose({name: '${escapeJxa(calendarName)}'});
      if (cals.length === 0) return JSON.stringify([]);
      const cal = cals[0];
      const evts = cal.events();
      const result = [];
      for (let i = 0; i < evts.length; i++) {
        const e = evts[i];
        const sd = e.startDate();
        const y = sd.getFullYear();
        const m = String(sd.getMonth() + 1).padStart(2, '0');
        const d = String(sd.getDate()).padStart(2, '0');
        result.push({
          uid: e.uid(),
          summary: e.summary(),
          startDate: y + '-' + m + '-' + d
        });
      }
      return JSON.stringify(result);
    })()
  `;
  const raw = await runJxa(script);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as CalendarEvent[];
  } catch {
    console.warn("TodoSync: failed to parse calendar events:", raw);
    return [];
  }
}

function escapeJxa(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
