# TodoSync

Sync Obsidian tasks with `@{date}` deadlines to Apple Calendar on macOS.

When you add a deadline to a task using the `@{YYYY-MM-DD}` format, TodoSync automatically creates an all-day event in your Apple Calendar. Completing or removing the task deletes the event. Obsidian is always the source of truth.

## Requirements

- **macOS** (uses Calendar.app via JavaScript for Automation)
- **Obsidian Desktop** (not supported on mobile)
- An Apple Calendar (iCloud, local, or any calendar visible in Calendar.app)

On first launch, macOS will ask for permission to control Calendar.app — allow it.

## Task format

Add a date to any markdown checkbox using `@{YYYY-MM-DD}`:

```markdown
- [ ] Submit report @{2026-03-15}
- [ ] Review PR @{2026-04-01}
```

Only unchecked tasks (`- [ ]`) with a date are synced. Checked tasks (`- [x]`) and tasks without dates are ignored.

Works with the [Kanban plugin](https://github.com/mgmeyers/obsidian-kanban) and any other plugin that uses standard markdown checkboxes.

## How sync works

| Action in Obsidian | Result in Apple Calendar |
|---|---|
| Add `- [ ] task @{date}` | All-day event created |
| Change `@{date}` | Event date updated |
| Check `[x]` | Event deleted |
| Uncheck back to `[ ]` | Event re-created |
| Delete the task line | Event deleted |

Sync triggers:
- Automatically when you edit a `.md` file (2-second debounce)
- On a periodic interval (default: every 5 minutes)
- On Obsidian startup
- Manually via the ribbon icon or the "TodoSync: Sync now" command

## Settings

| Setting | Default | Description |
|---|---|---|
| Calendar name | `Tasks` | Name of the Apple Calendar to sync with |
| Sync interval | `5` min | Periodic re-sync interval (0 to disable) |
| Watched folders | `/` (all) | Comma-separated vault folders to scan |

## Installation

### From Community Plugins (recommended)

1. Open **Settings → Community plugins → Browse**
2. Search for **TodoSync**
3. Click **Install**, then **Enable**

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/danila-biktimirov/obsidian-todosync/releases/latest)
2. Create a folder `todosync` inside your vault's `.obsidian/plugins/` directory
3. Place the three files in that folder
4. Restart Obsidian and enable the plugin in **Settings → Community plugins**

## Building from source

```bash
git clone https://github.com/danila-biktimirov/obsidian-todosync.git
cd obsidian-todosync
npm install
npm run build
```

The compiled plugin is output to `main.js` in the project root.

## Limitations

- **macOS only** — relies on `osascript` and JavaScript for Automation (JXA) to communicate with Calendar.app
- **Desktop only** — uses Node.js `child_process`, not available on Obsidian Mobile
- Task identity is based on the task text (excluding the date). If two tasks have identical text, only one calendar event is created
- Changes made on iOS/Android Obsidian will sync to calendar once Obsidian Desktop is opened on your Mac (via iCloud vault sync)

## License

[MIT](LICENSE)
