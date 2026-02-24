import { Task } from "./types";
import { createHash } from "crypto";

const TASK_REGEX = /^- \[([ x])\] (.+?)$/;
const DATE_REGEX = /@\{(\d{4}-\d{2}-\d{2})\}/;

export function parseTasks(content: string, filePath: string): Task[] {
  const tasks: Task[] = [];
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
      rawLine: line,
    });
  }

  return tasks;
}

export function taskHash(text: string): string {
  const normalized = text.toLowerCase().trim();
  return createHash("md5").update(normalized).digest("hex").slice(0, 12);
}

export function rebuildLine(text: string, done: boolean, date: string | null): string {
  const checkbox = done ? "[x]" : "[ ]";
  const datePart = date ? ` @{${date}}` : "";
  return `- ${checkbox} ${text}${datePart}`;
}
