// commands.js — top-level command dispatcher.

import { state } from './state.js';
import { addMessage, history, fileInput, updatePrompt } from './ui.js';
import { applyTheme, fetchAscii, SoundSys, getThemeNames } from './utils.js';
import {
    handleLogin, handleLogout, ensureAuth, updateStatus, showMotdOnce
} from './auth.js';
import { openProfileEditor } from './profile-editor.js';
import { openPostWriter, openProfileViewer, deletePost, openCommentComposer } from './posts.js';
import { openFeed } from './feed.js';
import {
    addFriend, setNickname, listFriends, listFriendsEmails, checkReqBox,
    pingUser, runWhois, showRecentMentions, runNeofetch,
    unfriend, blockUser, unblockUser, listOnlineFriends
} from './social.js';
import { startChat, registerCommandProcessor } from './chat.js';
import {
    joinRadio, claimRadioHost, promoteUser, demoteUser,
    kickUser, unkickUser, showRadioHost
} from './radio.js';

export async function processCommand(rawCmd) {
    const parts = rawCmd.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
        case 'help':
            addMessage('SYSTEM', 'COMMANDS:', true);
            addMessage(null, '--- AUTH & PROFILE ---');
            addMessage(null, '  login            - Sign in with Google');
            addMessage(null, '  logout           - Sign out');
            addMessage(null, '  set-bio          - Open Profile Editor');
            addMessage(null, '  whois [email]    - View User Profile');
            addMessage(null, '  status [mode]    - online/away/busy');
            addMessage(null, '');
            addMessage(null, '--- SOCIAL ---');
            addMessage(null, '  friend add [email]         - Add friend');
            addMessage(null, '  friend nick [email] [nick] - Set nickname');
            addMessage(null, '  unfriend [email]           - Remove friend');
            addMessage(null, '  friends / friends-email    - List friends');
            addMessage(null, '  who                        - List online friends');
            addMessage(null, '  block [email] / unblock    - Mute a user (client-side)');
            addMessage(null, '  reqbox                     - Check incoming chats');
            addMessage(null, '  mentions                   - Recent @-mentions');
            addMessage(null, '  ping [email]               - Probe a user');
            addMessage(null, '');
            addMessage(null, '--- CHAT & RADIO ---');
            addMessage(null, '  chat [name/email] - Start 1:1 chat');
            addMessage(null, '  radio [freq]      - Tune to broadcast freq');
            addMessage(null, '  burn [msg]        - Send self-destruct (10s)');
            addMessage(null, '  host              - Claim Radio Host (*)');
            addMessage(null, '  host [name]       - Promote (Admin only)');
            addMessage(null, '  unhost [name]     - Demote (Admin only)');
            addMessage(null, '  kick [name]       - Ban (Admin only)');
            addMessage(null, '  unkick [name]     - Unban (Admin only)');
            addMessage(null, '  host-list         - Show admins');
            addMessage(null, '  exit              - Leave chat / radio');
            addMessage(null, '');
            addMessage(null, '--- POSTS & FEED ---');
            addMessage(null, '  post              - Write a new post');
            addMessage(null, '  profile           - View your profile + posts');
            addMessage(null, '  feed              - Latest posts globally');
            addMessage(null, '  top               - Most-liked posts');
            addMessage(null, '  search [query]    - Search posts');
            addMessage(null, '  delete-post       - Delete current post (in reader)');
            addMessage(null, '  comment           - Open comment composer (in reader)');
            addMessage(null, '');
            addMessage(null, '--- SYSTEM ---');
            addMessage(null, '  date / time       - Current date / clock');
            addMessage(null, '  uptime            - Session uptime');
            addMessage(null, '  motd              - Message of the day');
            addMessage(null, '  dnd [on|off]      - Do-not-disturb mode');
            addMessage(null, '  neofetch          - System info');
            addMessage(null, '  ascii [url]       - Render ASCII (or upload)');
            addMessage(null, '  emoji             - List emoji codes');
            addMessage(null, '  theme [color]     - Set palette (random for surprise)');
            addMessage(null, '  mute / unmute     - Toggle sounds');
            addMessage(null, '  clear             - Clear screen');
            addMessage(null, '  help              - This screen');
            break;

        case 'clear':
            history.innerHTML = '';
            break;

        case 'set-bio':
            openProfileEditor();
            break;

        case 'post':
            if (!ensureAuth()) return;
            openPostWriter();
            break;

        case 'whois':
            if (!ensureAuth()) return;
            if (args[0]) openProfileViewer(args[0]);
            else addMessage('SYSTEM', 'USAGE: whois [email]', true);
            break;

        case 'profile':
            if (!ensureAuth()) return;
            if (state.currentUser && state.currentUser.email) openProfileViewer(state.currentUser.email);
            else addMessage('ERROR', 'NOT LOGGED IN.', false, false, true);
            break;

        case 'feed':
            if (!ensureAuth()) return;
            await openFeed({ mode: 'recent' });
            break;

        case 'top':
            if (!ensureAuth()) return;
            await openFeed({ mode: 'top' });
            break;

        case 'search': {
            if (!ensureAuth()) return;
            const q = args.join(' ').trim();
            if (!q) { addMessage('SYSTEM', 'USAGE: search [query]', true); break; }
            await openFeed({ mode: 'search', query: q });
            break;
        }

        case 'delete-post':
            if (!ensureAuth()) return;
            if (state.mode === 'TUI_POST_READ' && state.currentPostId) {
                state.pendingDelete = true;
                addMessage('SYSTEM', 'CONFIRM DELETE? PRESS [Y] IN POST READER, OR [ESC] TO CANCEL.', true);
            } else {
                addMessage('SYSTEM', 'OPEN A POST FIRST, THEN PRESS [D] OR RUN delete-post.', true);
            }
            break;

        case 'comment':
            if (!ensureAuth()) return;
            if (state.mode === 'TUI_POST_READ') {
                openCommentComposer();
            } else {
                addMessage('SYSTEM', 'OPEN A POST FIRST, THEN PRESS [C] OR RUN comment.', true);
            }
            break;

        case 'unfriend':
            if (!ensureAuth()) return;
            if (args[0]) await unfriend(args[0]);
            else addMessage('SYSTEM', 'USAGE: unfriend [email]', true);
            break;

        case 'block':
            if (!ensureAuth()) return;
            if (args[0]) await blockUser(args[0]);
            else addMessage('SYSTEM', 'USAGE: block [email]', true);
            break;

        case 'unblock':
            if (!ensureAuth()) return;
            if (args[0]) await unblockUser(args[0]);
            else addMessage('SYSTEM', 'USAGE: unblock [email]', true);
            break;

        case 'who':
            await listOnlineFriends();
            break;

        case 'time': {
            const d = new Date();
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
            addMessage('SYSTEM', `${d.toLocaleTimeString()} (${tz})`, true);
            break;
        }

        case 'uptime': {
            const ms = performance.now();
            const m = Math.floor(ms / 60000);
            const s = Math.floor((ms % 60000) / 1000);
            addMessage('SYSTEM', `UPTIME: ${m}m ${s}s`, true);
            break;
        }

        case 'motd':
            state.motdShown = false; // allow re-display
            await showMotdOnce();
            break;

        case 'dnd':
            if (args[0] === 'off') {
                state.dnd = false;
                addMessage('SYSTEM', 'DND OFF. NOTIFICATIONS RESTORED.', true);
            } else {
                state.dnd = true;
                addMessage('SYSTEM', 'DND ON. MENTIONS WILL BE SILENT.', true);
            }
            break;

        case 'mentions':
            await showRecentMentions();
            break;

        case 'emoji':
            addMessage('SYSTEM', 'AVAILABLE EMOJIS (Type code to use):', true);
            // Lazy import to avoid pulling EMOJI_MAP at module-eval time
            import('./data.js').then(({ EMOJI_MAP }) => {
                addMessage(null, Object.keys(EMOJI_MAP).join(' '));
            });
            break;

        case 'status': {
            if (!ensureAuth()) return;
            const validStatuses = ['online', 'away', 'busy'];
            if (args[0] && validStatuses.includes(args[0])) {
                await updateStatus(args[0]);
                addMessage('SYSTEM', `STATUS SET TO: ${args[0].toUpperCase()}`, true);
            } else {
                addMessage('SYSTEM', 'USAGE: status [online | away | busy]', true);
            }
            break;
        }

        case 'burn':
            addMessage('ERROR', 'ENTER A CHAT ROOM TO USE BURN.', false, false, true);
            break;

        case 'mute':
            state.muted = true;
            SoundSys.setMuted(true);
            addMessage('SYSTEM', 'SOUNDS MUTED.', true);
            break;

        case 'unmute':
            state.muted = false;
            SoundSys.setMuted(false);
            SoundSys.init();
            SoundSys.blip();
            addMessage('SYSTEM', 'SOUNDS ACTIVE.', true);
            break;

        case 'ascii':
            if (args[0]) {
                addMessage('SYSTEM', `FETCHING ASCII FROM ${args[0]}...`, true);
                try {
                    const asciiArt = await fetchAscii(args[0]);
                    addMessage(null, asciiArt, false, false, false, true);
                } catch (e) {
                    addMessage('ERROR', `FAILED: ${e.message}`, false, false, true);
                }
            } else {
                fileInput.click();
            }
            break;

        case 'theme': {
            const arg = args[0];
            if (arg === 'random') {
                const names = getThemeNames();
                const pick = names[Math.floor(Math.random() * names.length)];
                applyTheme(pick);
                state.theme = pick;
                addMessage('SYSTEM', `RANDOM THEME: ${pick.toUpperCase()}`, true);
            } else if (arg && applyTheme(arg)) {
                state.theme = arg;
                addMessage('SYSTEM', `THEME SET TO ${arg.toUpperCase()}`, true);
            } else {
                addMessage('SYSTEM', `USAGE: theme [${getThemeNames().join('|')}|random]`, true);
            }
            break;
        }

        case 'login':
            if (state.currentUser && !state.currentUser.isAnonymous) {
                addMessage('SYSTEM', 'ALREADY LOGGED IN.', true);
            } else {
                await handleLogin();
            }
            break;

        case 'logout':
            await handleLogout();
            break;

        case 'friend':
            if (!ensureAuth()) return;
            if (args[0] === 'add' && args[1]) addFriend(args[1]);
            else if (args[0] === 'nick' && args[1] && args[2]) setNickname(args[1], args[2]);
            else addMessage('SYSTEM', 'USAGE: friend add [email] OR friend nick [email] [nick]', true);
            break;

        case 'friends':
            if (!ensureAuth()) return;
            listFriends();
            break;

        case 'friends-email':
            if (!ensureAuth()) return;
            listFriendsEmails();
            break;

        case 'reqbox':
            if (!ensureAuth()) return;
            checkReqBox();
            break;

        case 'chat':
            if (!ensureAuth()) return;
            if (args[0]) startChat(args[0]);
            else addMessage('SYSTEM', 'USAGE: chat [name/email]', true);
            break;

        case 'radio':
            if (!ensureAuth()) return;
            if (args[0]) joinRadio(args[0]);
            else addMessage('SYSTEM', 'USAGE: radio [frequency] (e.g. 101.5)', true);
            break;

        case 'host':
            if (args.length > 0) {
                let target = args.join(' ');
                const match = target.match(/@\((.*?)\)/);
                if (match) target = match[1];
                await promoteUser(target);
            } else {
                await claimRadioHost();
            }
            break;

        case 'unhost':
            if (args.length > 0) {
                let target = args.join(' ');
                const match = target.match(/@\((.*?)\)/);
                if (match) target = match[1];
                await demoteUser(target);
            } else {
                addMessage('SYSTEM', 'USAGE: unhost [username]', true);
            }
            break;

        case 'kick':
            if (args.length > 0) {
                let target = args.join(' ');
                const match = target.match(/@\((.*?)\)/);
                if (match) target = match[1];
                await kickUser(target);
            } else {
                addMessage('SYSTEM', 'USAGE: kick [username]', true);
            }
            break;

        case 'unkick':
            if (args.length > 0) {
                let target = args.join(' ');
                const match = target.match(/@\((.*?)\)/);
                if (match) target = match[1];
                await unkickUser(target);
            } else {
                addMessage('SYSTEM', 'USAGE: unkick [username]', true);
            }
            break;

        case 'host-list':
            await showRadioHost();
            break;

        case 'date':
            addMessage('SYSTEM', new Date().toString(), true);
            break;

        case 'neofetch':
            runNeofetch();
            break;

        case 'ping':
            if (!ensureAuth()) return;
            if (args[0]) await pingUser(args[0]);
            else addMessage('SYSTEM', 'USAGE: ping [email]', true);
            break;

        case 'exit':
            if (state.mode === 'CHAT' || state.mode === 'RADIO') {
                if (state.messagesUnsubscribe) state.messagesUnsubscribe();
                if (state.channelMetaUnsubscribe) state.channelMetaUnsubscribe();
                state.messagesUnsubscribe = null;
                state.channelMetaUnsubscribe = null;

                state.mode = 'COMMAND';
                state.currentChatPartner = null;

                history.innerHTML = '';
                addMessage('SYSTEM', 'DISCONNECTED.', true);

                const name = state.currentUser && !state.currentUser.isAnonymous
                    ? (state.currentUser.displayName || state.currentUser.email.split('@')[0])
                    : 'guest';
                updatePrompt(name);
            }
            break;

        default:
            addMessage('SYSTEM', `UNKNOWN COMMAND: ${cmd}`, true);
    }
}

// Resolve circular dependency: chat.js needs processCommand to route admin
// commands typed inside chat/radio mode through this dispatcher.
registerCommandProcessor(processCommand);
