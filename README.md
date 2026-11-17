# Mini Office

**A 3D isometric office where every desk is a real Claude Code session.**

Each room is a folder on your computer. Step up to a room's portal, give an agent a task, and a real [Claude Code](https://code.claude.com/docs/en/overview) session starts in that folder. The agent walks to a desk and types while Claude works. It wanders off for coffee when the task is done, raises a speech bubble when it needs your permission, and leaves through the portal when its session ends. Zoom in on any desk to read the live terminal and type into it, or hold Space and just talk to your agents.

> Source-available and free for noncommercial use under the [PolyForm Noncommercial License](LICENSE.md). See [License](#license).

## What you can do

- **Run several agents side by side.** Up to 4 Claude Code sessions per room, each with its own task, name, model and permission mode.
- **See at a glance what everyone is doing.** Agents type while Claude works, take breaks when idle (coffee machine, water cooler, bookshelf, whiteboard, couch) and walk out when their session ends.
- **Answer permission requests in the office.** When Claude wants to run a command or edit a file, the agent raises a speech bubble with **Allow** and **Deny**. Trusting a new folder works the same way.
- **Watch and type into the real terminal.** **Watch** zooms the camera onto an agent's monitor, which shows its live Claude Code terminal. Click it to type, scroll to read back.
- **Talk to your agents.** Hold Space and say a name. "Ada, what are you doing?" gets an answer in a speech bubble. "Ada, check why the login test fails" is typed into Ada's session, and Claude's answer pops up when it's done.
- **Lay out the office.** Add rooms for other folders with the **+** bridges, move or remove them, and spin the camera all the way around.

## Requirements

Tested on macOS with:

- **Node.js 24** (Next.js needs at least 20.9)
- **Claude Code 2.1.x**, installed, logged in, with `claude` on your `PATH`. Agents use your own Claude account.
- **Chrome**, the only browser tried so far. Talking to agents needs the Web Speech API, which Edge and Safari also have.

Linux should work but is untested. Windows isn't supported: the app relies on Unix sockets and `node-pty`'s macOS/Linux helper.

## Quick start

```bash
git clone https://github.com/kumargaurav121/mini-office-3d-setup.git
cd mini-office-3d-setup
npm install
npm run dev
```

Open **http://127.0.0.1:3000**. The first time, Mini Office asks which folder should be your main room: pick one of your repos, step into a folder, or paste the path of any folder in your home directory. That choice is saved to `office.config.json`, and the office opens.

`npm install` also makes `node-pty`'s helper executable (a `postinstall` step). Without it, starting an agent fails with `posix_spawnp failed`. Newer npm versions may warn that `node-pty`'s own install scripts were skipped; that's expected, because its prebuilt binaries are used.

## Configuration

`office.config.json` sits in the project root and is yours alone (it's gitignored). The first run writes it for you; edit it any time, then reload:

```json
{
  "mainRoom": "~/code/my-project",
  "repoRoots": ["~/code"]
}
```

| Key | What it does |
| --- | --- |
| `mainRoom` | The folder for the main room, in the middle of the office. `~` means your home folder; a relative path is relative to this project. |
| `repoRoots` | Folders the room picker may use. It lists git repos up to 6 levels deep under them, and lets you browse or paste any folder inside them. |

Until `office.config.json` exists, the app takes its `repoRoots` from `office.config.example.json`, which allows any folder in your home directory. To switch to a different main room later, change `mainRoom` in your `office.config.json`; to see the first-run picker again, delete the file.

The rooms you add, and where they sit, are saved in `.office/rooms.json`. Delete that file to start over with just the main room.

## Using it

### Rooms

The room in focus has its walls lowered so you can see inside. Click a room's name plate to fly to it, or **Show all** to see the whole office.

- **Add a room:** click a **+** on a free side of any room, then search your repos, browse to a folder, or paste a path. The new room appears on that side, joined by a bridge.
- **Move or remove a room:** focus it and use **Move** or **Remove** on its name plate. The folder on disk is never touched. The main room stays put, and a room can't be moved or removed if that would cut other rooms off from the main room.

### Agents

1. Click the glowing **portal** in a room, or **+ agent** in the side panel.
2. Fill in:
   - **Task:** what Claude should do. It becomes the session's first prompt.
   - **Name:** what the agent is called in the office. It's also the name you say to talk to it.
   - **Model:** Claude Code's default, Opus, Sonnet or Haiku.
   - **Permissions:**
     - **Auto:** Claude asks only about risky actions. This is the default.
     - **Ask before acting:** a bubble for every edit or command.
     - **Plan only:** reads and plans, never changes anything.
3. **Spawn.** The agent steps out of the portal and walks to the next free desk.

The side panel lists every agent with what it's doing right now:

- **Watch** flies the camera to the agent's monitor.
- **End** stops the session. Click it twice; the second click confirms.

Each session keeps a fixed ID, shown when you hover an agent in the side panel. Resume a session later in your own terminal with `claude --resume <id>`.

### Permission bubbles

When Claude needs your OK, the agent stops and a bubble appears over its head, for example "Run npm test" with **Allow** and **Deny**. The header shows how many agents are waiting for you. If you don't answer within about 10 minutes, Claude asks in its terminal instead.

The first time Claude Code opens a folder it asks whether to trust it. That question comes as a bubble too, with **Trust** and **Exit**.

### Watching the terminal

**Watch** frames the agent's monitor. The terminal on it is the real one:

- Click it to type, and scroll to read back.
- What you type goes straight to Claude Code. Esc, for example, interrupts Claude.
- To zoom back out, click the room's name plate or **Show all**.

### Talking to agents

Hold **Space**, or the **Hold Space to talk** button at the top left, and say an agent's name followed by what you want:

- **Questions about them**, like "Ada, what are you doing?", "how's it going?" or "are you done?", are answered at once from what the agent is doing. Nothing is sent to Claude.
- **Anything else is a task.** The agent says "Okay, let me check." (or "On it!" for a plain instruction) and your words are typed into its Claude Code session as a prompt. When Claude finishes, the start of its answer appears as a speech bubble; the full answer is on the agent's monitor.
- **If the agent is busy**, starting up or waiting on a permission, it says when it'll get to it, and your words are typed in as soon as it's free.
- **If you don't say a name**, you're talking to the agent you're watching, or else the one you've selected. Slightly misheard names are fine ("Adah" reaches Ada).

Space still types a space in text fields and the terminal, and still presses a button you've moved to with Tab. The first time, Chrome asks to use your microphone.

### Mouse and keyboard

| | |
| --- | --- |
| Drag | Rotate the camera |
| Right-drag | Pan |
| Scroll | Zoom |
| Click an agent | Select it (shows its name and status) |
| Hold Space | Talk |
| Esc | Clear the selection, cancel a move |

## How it works

- **App:** a Next.js app. The 3D office is drawn with three.js through React Three Fiber.
- **Sessions:** the server starts each agent as a real `claude` process in a pseudo-terminal (`node-pty`), in the room's folder.
- **Hooks:** each session gets Claude Code hooks just for itself, passed with `--settings` and layered over your own settings, which stay untouched. The hooks report what Claude is doing over a private Unix socket: prompt submitted, tool started, permission needed, done. The agents' behaviour in the office comes from those reports.
- **Permissions:** a `PermissionRequest` hook waits for you to click **Allow** or **Deny** and hands your answer back to Claude.
- **Streaming:** the browser receives agent states and terminal output over server-sent events. The monitor shows the terminal as a texture in the 3D scene, so things in front of it hide it properly. An invisible terminal laid exactly over the monitor takes your typing and scrolling.
- **Speech:** recognition is the browser's Web Speech API.

## Safety and privacy

- **Agents are real.** Each one is a Claude Code session that can read, edit and run things in its folder with your user's permissions, on your Claude account. Pick the permission mode with that in mind. **Auto** lets Claude act without asking on anything it doesn't judge risky.
- **Localhost only.** The dev server listens on 127.0.0.1, and the endpoints that start or control agents refuse requests not addressed to localhost. Don't expose this app to a network.
- **Agents are meant to stop with the server.** When it shuts down it ends their sessions; if a `claude` process ever lingers, `pgrep -fl "claude.*--session-id"` finds it. Transcripts stay resumable with `claude --resume`.
- **Push-to-talk audio goes to Google.** Chrome transcribes speech with Google's online service. Nothing is recorded unless you hold Space or the talk button.
- **Folder access:** `repoRoots` limits which folders can become rooms. The default (`~`) allows anything in your home folder.

## Development

```bash
npm run dev         # start on http://127.0.0.1:3000
npm test            # unit tests (Vitest)
npm run typecheck   # TypeScript
npm run lint        # ESLint
```

The tests cover the logic that doesn't need a browser:

- the room grid rules
- the room store and repo scan
- first-run setup (choosing the main room)
- the agent registry, against a fake terminal
- how hook events become session state
- how spoken sentences are understood

In dev mode, running agents survive code edits; restarting the server ends them.

## Limitations

- 4 agents per room.
- Talking to agents needs Chrome (or another browser with the Web Speech API) and an internet connection.
- If you've half-typed something in an agent's terminal, words you speak to it are added to the end of it.
- Tested on macOS only.

## Contributing

Issues and pull requests are welcome.

## License

Copyright 2026 Kumar Gaurav. Released under the [PolyForm Noncommercial License 1.0.0](LICENSE.md).

**Allowed:** use, change, fork and share it for noncommercial purposes. That includes personal projects, study, hobby use and research, and use by charities, schools, public research bodies and government. Keep the license and its notice line with any copy you share.

**Needs permission:** any commercial use, such as using it at or for a business, or selling or hosting it. To ask, open an issue on GitHub.

This isn't an "open source" license in the OSI sense, because it restricts commercial use. The code is public, but it is not free for every purpose. This section is a summary; the license text in [LICENSE.md](LICENSE.md) is what counts.

Mini Office is an independent project. It isn't made or endorsed by Anthropic; "Claude" and "Claude Code" are Anthropic's names for their products.
