# TChat — Terminal Chat / Link v2.0

A CRT-styled, BBS-flavored single-page web app. Sign in with Google, send 1:1 messages, broadcast on radio frequencies, write social posts, comment, like, and tinker with retro terminal themes — all in vanilla JS over Firebase.

```
  _______   _____ _           _
 |__   __| / ____| |         | |
    | |   | |    | |__   __ _| |_
    | |   | |____| | | | (_| | |_
    |_|    \_____|_| |_|\__,_|\__|  v2.0
```

![Vanilla JS](https://img.shields.io/badge/vanilla-JS-yellow) ![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-orange) ![No build](https://img.shields.io/badge/build-none-lightgrey)

---

## Screenshots

> Drop PNGs into `docs/img/` and they'll render here automatically.

| | |
|---|---|
| ![Boot sequence](docs/img/boot.png) | ![Welcome screen](docs/img/welcome.png) |
| **Boot** — BIOS + kernel handshake | **Welcome** — quick-start + ASCII logo |
| ![1:1 chat](docs/img/chat.png) | ![Radio broadcast](docs/img/radio.png) |
| **Chat** — burn messages, mentions, ASCII | **Radio** — `[freq] MHz` rooms with admins |
| ![Post writer](docs/img/post-writer.png) | ![Profile viewer](docs/img/profile.png) |
| **Posts** — title / body / ASCII art | **Profile** — bio + post list |
| ![Feed](docs/img/feed.png) | ![Mobile](docs/img/mobile.png) |
| **Feed** — recent / top / search | **Mobile** — full-screen TUI + TAB key |

---

## Quick start

```bash
# ES modules need an HTTP server. file:// will not work.
python -m http.server 8000
# then open http://localhost:8000/
```

Sign in with Google (top of `commands.js` bootstraps anonymous mode for browsing). The Firebase config in `scripts/firebase-config.js` points at the live `tchat-b75ee` project, so local sessions hit production Firestore — be considerate.

To run on mobile, just point your phone's browser at the same LAN address. The app uses `100dvh` and a touch-aware TAB button so the on-screen keyboard doesn't fight the autocomplete.

---

## Architecture

`index.html` loads exactly one ES module — `scripts/script.js`. That entry point imports the rest. One responsibility per file:

| File | What it does |
|---|---|
| `script.js` | Entry. Wires modules, owns the global keydown router, file-upload handler. |
| `firebase-config.js` | Firebase init: `app`, `auth`, `db`, `appId`. |
| `state.js` | Single mutable `state` object. `mode` is the central switch. |
| `data.js` | `bootText`, `commandsList`, `subCommands`, `EMOJI_MAP`. |
| `utils.js` | `SoundSys`, themes, ASCII conversion, `parseEmojis`, `getConversationId`. |
| `ui.js` | DOM refs, `addMessage`, autocomplete, boot sequence, `closeAllWindows`, list-nav helper. |
| `auth.js` | Google login/logout, status, notification listener, motd, blocked-set listener. |
| `commands.js` | `processCommand` dispatcher + help text. |
| `chat.js` | 1:1 conversations, mention notifications, block-aware filtering. |
| `radio.js` | Broadcast frequency rooms with admins / kick / unkick. |
| `social.js` | Friends, mentions, whois, ping, neofetch, block/unblock, who. |
| `posts.js` | Post writer, viewer, reader, likes, deletes, comments composer. |
| `comments.js` | Read/write helpers for the `posts/{id}/comments` subcollection. |
| `profile-editor.js` | TUI editor for nickname / bio / avatar. |
| `feed.js` | Global feed: `recent` / `top` / `search` modes. |

The `state.mode` enum drives keystroke routing:
`COMMAND | CHAT | RADIO | PROFILE_EDIT | TUI_PROFILE | TUI_POST_WRITE | TUI_POST_READ | TUI_FEED`.

---

## Command reference

> Type any command in the prompt. **TAB** autocompletes. **↑/↓** scrolls history.

### Auth & profile

| Command | Description |
|---|---|
| `login` | Google OAuth popup. |
| `logout` | Drops back to guest mode. |
| `set-bio` | Open the profile editor (nickname / bio / avatar). |
| `whois [email]` | Look up any user's public profile. |
| `profile` | Open *your* profile + post list. |
| `status [online\|away\|busy]` | Set presence. Visible to friends. |

### Social

| Command | Description |
|---|---|
| `friend add [email]` | Add someone to your friends list. |
| `friend nick [email] [name]` | Set a personal nickname. |
| `unfriend [email]` | Remove a friend. |
| `friends` | List with online-status dots. |
| `friends-email` | List with raw emails + nicknames. |
| `who` | Just the friends currently online. |
| `block [email]` | Mute a user (client-side filter — see caveat below). |
| `unblock [email]` | Restore. |
| `ping [email]` | Probe presence + round-trip time. |
| `reqbox` | Inbound chats from non-friends. |
| `mentions` | Recent `@(you)` events. |

### Chat & radio

| Command | Description |
|---|---|
| `chat [name\|email]` | Start a 1:1 conversation. |
| `radio [freq]` | Tune to a public broadcast (e.g. `radio 101.5`). |
| `burn [msg]` | Send a 10-second self-destruct (works in chat or radio). |
| `ascii [url]` | Render and send ASCII art. With no URL, opens file picker. |
| `host` | Claim host on an unowned radio channel. |
| `host [name]` | Promote another user to admin (host only). |
| `unhost [name]` | Demote. |
| `kick [name]` | Ban from the current radio channel. |
| `unkick [name]` | Unban. |
| `host-list` | Show admins + ban count. |
| `exit` | Leave the chat / radio room. |

In any message, `(emoji-name)` expands (try `(tableflip)`), and `@(DisplayName)` mentions someone — they get a screen flash + notification on their end.

### Posts & feed

| Command | Description |
|---|---|
| `post` | Open the post writer (title + body + optional ASCII). Ctrl+Enter publishes. |
| `feed` | Latest 50 posts globally. |
| `top` | 50 highest-liked posts. |
| `search [query]` | Client-side keyword search across the latest 100 posts. |
| `delete-post` | Delete the open post (author only). Two-keystroke confirm. |
| `comment` | Open the comment composer for the open post. |

In the post reader: `[L]` like (per-user), `[C]` comment, `[D]` delete (own posts), `[ESC]` close.

### System

| Command | Description |
|---|---|
| `date` | Full date string. |
| `time` | Current time + timezone. |
| `uptime` | How long this session has been running. |
| `motd` | Show the message-of-the-day (auto-shown once per session). |
| `dnd [on\|off]` | Do-not-disturb — silences mention flash + sound. |
| `neofetch` | Retro system-info screen. |
| `mute` / `unmute` | Toggle all sounds. |
| `clear` | Wipe the screen. |
| `emoji` | List every emoji code. |
| `help` | This reference, in-app. |

### Themes

| Command | Description |
|---|---|
| `theme [name]` | Switch palette. Names: `green`, `amber`, `blue`, `white`, `matrix`, `red`, `purple`, `c64`, `gameboy`. |
| `theme random` | Surprise me. |

---

## Keyboard shortcuts

| Key | Where | Action |
|---|---|---|
| `TAB` | Anywhere | Autocomplete commands / emoji codes / `@(mention)` (in radio). |
| `↑` / `↓` | Command line | Scroll command history. |
| `Shift+Enter` | Command line | Insert newline (multi-line input). |
| `Enter` | Command line | Submit. |
| `Escape` | TUI window | Close window / cancel composer / cancel pending delete. |
| `L` | Post reader | Toggle like. |
| `C` | Post reader | Open comment composer. |
| `D` then `Y` | Post reader (own post) | Delete post. |
| `Ctrl+Enter` | Post writer / comment | Publish / send. |
| `[TAB]` button | Mobile | Touch-friendly autocomplete trigger. |

---

## Themes

| Name | Main | System | Chat | Error | Radio |
|---|---|---|---|---|---|
| `green` *(default)* | `#33ff00` | `#ffaa00` | `#00ccff` | `#ff3333` | `#ff33cc` |
| `amber` | `#ffb000` | `#ffcc00` | `#ffb000` | `#ff5500` | `#ff8800` |
| `blue` | `#0088ff` | `#00aaff` | `#00ffff` | `#ff3333` | `#cc00ff` |
| `white` | `#e0e0e0` | `#ffffff` | `#cccccc` | `#ff3333` | `#ff00ff` |
| `matrix` | `#00ff41` | `#008f11` | `#003b00` | `#ff3333` | `#00ff00` |
| `red` | `#ff3333` | `#ff8800` | `#ff66aa` | `#ffff00` | `#ff00ff` |
| `purple` | `#cc66ff` | `#ff99ff` | `#9966ff` | `#ff3333` | `#ff33cc` |
| `c64` | `#a0a0ff` | `#7878d8` | `#ffffff` | `#ff5555` | `#ffff55` |
| `gameboy` | `#9bbc0f` | `#8bac0f` | `#306230` | `#0f380f` | `#306230` |

---

## Firestore data model

All paths root at `artifacts/{appId}/...` where `appId = 'tchat-terminal'` by default.

```
public/data/
  user_profiles/{uid}        # displayName, bio, avatarAscii, status, joinedAt
  posts/{postId}             # author fields, title, body, asciiArt, likes, likedBy[]
    comments/{commentId}     # authorId, authorName, text, timestamp
  messages/{msgId}           # conversationId = sortedUid_sortedUid OR RADIO_{freq}
  radio_channels/{freq}      # admins[], banned[]
  system/motd                # { text } — read-only client-side, write via console

users/{uid}/
  friends/{friendUid}        # owner-only
  notifications/{notifId}    # owner-only
  blocked/{blockedUid}       # owner-only — client-side mute list
```

`@(displayName)` mentions in messages or comments write a notification doc to the recipient's `notifications` subcollection. Their listener picks it up with a 30-second freshness gate and runs the screen flash.

**Block caveat**: blocking is currently client-side only. The blocker's UI filters out messages from the blocked uid in the `onSnapshot` callback, but the blocked user can still write messages and see all public posts. Set up server-side rules if you need real isolation — see `FIRESTORE_RULES.md`.

---

## Setup

1. Set up Firebase Auth with the Google provider.
2. Create a Firestore database.
3. Copy the rules from `FIRESTORE_RULES.md` into the Firebase Console rules editor and publish.
4. Update `scripts/firebase-config.js` if you're not using the bundled config.
5. (Optional) Create the doc `artifacts/tchat-terminal/public/data/system/motd` with a `text` field — it'll show on login.

The repo's `.gitignore` keeps Claude Code metadata (`CLAUDE.md`, `.claude/`) out of version control.

---

## Mobile notes

- TUI windows go full-screen on phones (≤ 480px) so post bodies and comments aren't cramped.
- Post inputs use `font-size: 16px` to prevent iOS auto-zoom on focus.
- The on-screen `[TAB]` button next to the input bar is the touch-autocomplete affordance — it triggers the same handler as keyboard TAB.
- Tested on Chrome / Safari mobile emulation. If the soft keyboard hides the input line, scroll the chat history; the input scrolls into view on focus.

---

## License & credits

Author: [Kia Hawatri](https://github.com/Khawatri).
Licensed under MIT (or whichever license you'd like — drop a `LICENSE` file in the root).

Built with vanilla JS and a lot of `addMessage(...)`. No frameworks, no bundler, no test runner. Stays that way on purpose.
