// ui.js — DOM helpers, rendering, autocomplete, boot sequence.
// All UI primitives that other modules can call without thinking about
// the DOM tree directly.

import { state } from './state.js';
import { SoundSys, applyTheme } from './utils.js';
import { commandsList, subCommands, EMOJI_MAP } from './data.js';

// --- DOM References (all top-level elements) ---
export const input = document.getElementById('command-input');
export const inputLineContainer = document.getElementById('input-line-container');
export const history = document.getElementById('chat-history');
export const container = document.getElementById('terminal-container');
export const promptSpan = document.getElementById('prompt-span');
export const cmdBefore = document.getElementById('cmd-before');
export const cmdCursor = document.getElementById('cmd-cursor');
export const cmdAfter = document.getElementById('cmd-after');
export const autocompleteMenu = document.getElementById('autocomplete-menu');
export const fileInput = document.getElementById('file-upload');
export const tabBtn = document.getElementById('tab-btn');
export const editorOverlay = document.getElementById('profile-editor-overlay');
export const crtOverlay = document.getElementById('crt-overlay');

// Editor refs
export const editNick = document.getElementById('edit-nick');
export const editBio = document.getElementById('edit-bio');
export const editAvatar = document.getElementById('edit-avatar');
export const editorElements = [
    document.getElementById('row-nick'),
    document.getElementById('row-bio'),
    document.getElementById('row-avatar'),
    document.getElementById('btn-save'),
    document.getElementById('btn-cancel')
];

// --- Input display (the visible "cursor") ---
export function updateInputDisplay() {
    if (state.mode === 'PROFILE_EDIT') return;
    const val = input.value;
    const selStart = input.selectionStart || 0;
    const left = val.substring(0, selStart);
    const char = val.substring(selStart, selStart + 1) || ' ';
    const right = val.substring(selStart + 1);

    cmdBefore.textContent = left;
    cmdCursor.textContent = char;
    cmdAfter.textContent = right;
}

['input', 'click', 'focus', 'blur'].forEach(evt => {
    input.addEventListener(evt, () => requestAnimationFrame(updateInputDisplay));
});

// --- Scroll ---
export function scrollToBottom() {
    history.scrollTop = history.scrollHeight;
}

// --- Scramble effect ---
export function scrambleText(element, finalValidText, finalHTML = null) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
    let iterations = 0;
    const originalText = finalValidText;

    const interval = setInterval(() => {
        element.innerText = originalText.split('').map((char, index) => {
            if (char === ' ' || char === '\n') return char;
            if (index < Math.floor(iterations)) return originalText[index];
            return chars[Math.floor(Math.random() * chars.length)];
        }).join('');

        if (iterations >= originalText.length) {
            clearInterval(interval);
            if (finalHTML) {
                element.innerHTML = finalHTML;
            } else {
                element.innerText = originalText;
            }
        }

        iterations += 1 / 3 + (originalText.length / 300);
    }, 60);
}

// --- Add a message line ---
export function addMessage(sender, text, isSystem = false, isChat = false, isError = false, isAscii = false, msgId = null, isBurn = false, isRadio = false) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message-line');
    if (isSystem) msgDiv.classList.add('system-msg');
    if (isChat) msgDiv.classList.add('chat-msg');
    if (isRadio) msgDiv.classList.add('radio-msg');
    if (isError) msgDiv.classList.add('error-msg');
    if (isAscii) msgDiv.classList.add('ascii-art');

    if (msgId) {
        msgDiv.setAttribute('data-msg-id', msgId);
        state.msgMap.set(msgId, msgDiv);
    }

    if (!state.muted && (isSystem || (isChat && sender !== 'ME') || (isRadio && sender !== 'ME'))) {
        setTimeout(() => SoundSys.blip(), 50);
    }

    const contentSpan = document.createElement('span');

    if (sender) {
        let prefixColor = 'var(--terminal-main)';
        if (isChat) prefixColor = (sender === 'ME') ? 'var(--terminal-main)' : 'var(--chat-color)';
        if (isSystem) prefixColor = 'var(--system-color)';
        if (isError) prefixColor = 'var(--error-color)';

        const prefixSpan = document.createElement('span');
        prefixSpan.className = 'user-prefix';
        prefixSpan.style.color = prefixColor;
        prefixSpan.textContent = `[${sender}]: `;
        msgDiv.appendChild(prefixSpan);
    }

    let finalHTML = null;
    if (!isAscii && text) {
        let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        html = html.replace(/@\((.*?)\)/g, '<span class="highlight-mention">@($1)</span>');
        contentSpan.innerHTML = html;
        finalHTML = html;
    } else {
        contentSpan.textContent = text;
    }

    msgDiv.appendChild(contentSpan);

    if (isBurn) {
        const burnSpan = document.createElement('span');
        burnSpan.className = 'burn-timer';
        burnSpan.textContent = ' [10s]';
        msgDiv.appendChild(burnSpan);

        let left = 10;
        const timer = setInterval(() => {
            left--;
            if (left >= 0) burnSpan.textContent = ` [${left}s]`;
            else clearInterval(timer);
        }, 1000);
    }

    history.appendChild(msgDiv);
    scrollToBottom();

    if ((isChat && sender !== 'ME') || isSystem || (isRadio && sender !== 'ME')) {
        if (!isAscii) scrambleText(contentSpan, text, finalHTML);
    }

    return msgDiv;
}

// --- Prompt ---
export function updatePrompt(username) {
    if (state.mode === 'CHAT') {
        const name = state.currentChatPartner.nickname || state.currentChatPartner.email;
        promptSpan.textContent = `[CHAT:${name}] >`;
        input.style.caretColor = 'var(--chat-color)';
    } else if (state.mode === 'RADIO') {
        const name = state.currentChatPartner.frequency;
        promptSpan.textContent = `[RADIO:${name}] >`;
        input.style.caretColor = 'var(--radio-color)';
    } else {
        promptSpan.textContent = `${username}@TChat:~$`;
        input.style.caretColor = 'var(--terminal-main)';
    }
}

// --- Autocomplete ---
export function showAutocompleteMenu(options) {
    autocompleteMenu.innerHTML = '';
    state.autocompleteOptions = options;
    state.autocompleteIndex = -1;

    if (options.length === 0) {
        autocompleteMenu.style.display = 'none';
        return;
    }

    options.forEach((opt) => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.textContent = opt;
        div.onclick = () => confirmSelection(opt);
        autocompleteMenu.appendChild(div);
    });

    autocompleteMenu.style.display = 'flex';
}

export function hideAutocomplete() {
    autocompleteMenu.style.display = 'none';
    state.autocompleteOptions = [];
    state.autocompleteIndex = -1;
}

export function highlightOption(index) {
    const items = autocompleteMenu.children;
    for (let i = 0; i < items.length; i++) items[i].classList.remove('selected');
    if (index >= 0 && index < items.length) {
        items[index].classList.add('selected');
        items[index].scrollIntoView({ block: 'nearest' });
    }
}

export function confirmSelection(selectedValue) {
    const val = input.value;

    if (selectedValue.startsWith('@(')) {
        const lastAtParen = val.lastIndexOf('@(');
        if (lastAtParen !== -1) {
            const prefix = val.substring(0, lastAtParen);
            input.value = prefix + selectedValue + ' ';
            hideAutocomplete();
            updateInputDisplay();
            input.focus();
            return;
        }
    }

    const lastSpaceIdx = val.lastIndexOf(' ');
    if (lastSpaceIdx === -1) {
        input.value = selectedValue + ' ';
    } else {
        const prefix = val.substring(0, lastSpaceIdx + 1);
        input.value = prefix + selectedValue + ' ';
    }

    hideAutocomplete();
    updateInputDisplay();
    input.focus();
}

export function handleTabCompletion(e) {
    e.preventDefault();

    if (autocompleteMenu.style.display === 'flex') {
        state.autocompleteIndex = (state.autocompleteIndex + 1) % state.autocompleteOptions.length;
        highlightOption(state.autocompleteIndex);
        return;
    }

    const val = input.value;
    let matches = [];

    const mentionMatch = val.match(/@\(([^)]*)$/);
    if (mentionMatch && state.mode === 'RADIO') {
        const term = mentionMatch[1].toLowerCase();
        const participants = Array.from(state.activeRadioParticipants);
        matches = participants
            .filter(name => name.toLowerCase().startsWith(term))
            .map(name => `@(${name})`);
    } else {
        const parts = val.split(' ');
        const currentWord = parts[parts.length - 1];

        if (currentWord.startsWith('(')) {
            const emojiKeys = Object.keys(EMOJI_MAP);
            matches = emojiKeys.filter(key => key.startsWith(currentWord));
        } else if (parts.length === 1 && currentWord !== "") {
            matches = commandsList.filter(cmd => cmd.startsWith(currentWord));
        } else if (parts.length === 2 && !currentWord.startsWith('(')) {
            const cmd = parts[0];
            if (subCommands[cmd]) {
                matches = subCommands[cmd].filter(sub => sub.startsWith(currentWord));
            }
        }
    }

    if (matches.length === 1) {
        confirmSelection(matches[0]);
    } else if (matches.length > 1) {
        showAutocompleteMenu(matches);
    }
}

// --- Window management ---
export function closeAllWindows() {
    document.querySelectorAll('.tui-window').forEach(w => { w.style.display = 'none'; });

    state.mode = 'COMMAND';
    state.activeWindow = null;
    state.menuIndex = 0;
    state.isPublishing = false;
    state.currentPostId = null;

    const publishBtn = document.getElementById('post-publish-btn');
    if (publishBtn) {
        publishBtn.disabled = false;
        publishBtn.textContent = '[ PUBLISH ]';
    }
}

// --- Notifications (the visual flash + sound) ---
export function triggerNotificationEffect(notif) {
    SoundSys.alert();
    crtOverlay.classList.add('notification-flash');
    setTimeout(() => crtOverlay.classList.remove('notification-flash'), 500);
    addMessage('ALERT', `MENTIONED BY [${notif.fromName}]: "${notif.preview}"`, true);
}

// --- List navigation (shared between profile viewer and feed) ---
// Returns true if the event was handled.
export function handleListNavigation(event, listSelector, onEnter) {
    const list = document.querySelector(listSelector);
    if (!list) return false;
    const items = list.querySelectorAll('.profile-post-item[data-post-id]');
    if (items.length === 0) return false;

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        state.menuIndex = (state.menuIndex + 1) % items.length;
        items.forEach((item, index) => item.classList.toggle('selected', index === state.menuIndex));
        items[state.menuIndex].scrollIntoView({ block: 'nearest' });
        return true;
    }
    if (event.key === 'ArrowUp') {
        event.preventDefault();
        state.menuIndex = (state.menuIndex - 1 + items.length) % items.length;
        items.forEach((item, index) => item.classList.toggle('selected', index === state.menuIndex));
        items[state.menuIndex].scrollIntoView({ block: 'nearest' });
        return true;
    }
    if (event.key === 'Enter') {
        event.preventDefault();
        const selected = items[state.menuIndex];
        if (selected) {
            const postId = selected.getAttribute('data-post-id');
            if (postId) onEnter(postId);
        }
        return true;
    }
    return false;
}

// --- Boot sequence ---
const bootText = [
    "BIOS DATE 01/01/99 14:22:55 VER 1.0.2",
    "CPU: NEC V60, SPEED: 33MHz",
    "640K RAM SYSTEM... OK",
    "LOADING T-OS KERNEL...",
    "MOUNTING VIRTUAL FILESYSTEM... OK",
    "INITIATING NETWORK PROTOCOLS...",
    "  > TCP/IP... UP",
    "  > FIREWALL... ACTIVE",
    "  > ENCRYPTION... ENABLED",
    "CONNECTING TO SATELLITE UPLINK...",
    "CONNECTION ESTABLISHED.",
    "STARTING T-CHAT INTERFACE..."
];

export async function runBootSequence() {
    SoundSys.init();

    await new Promise(r => setTimeout(r, 800));

    for (const line of bootText) {
        SoundSys.click();
        addMessage(null, line, true);
        await new Promise(r => setTimeout(r, 100 + Math.random() * 250));
    }

    await new Promise(r => setTimeout(r, 1000));

    history.innerHTML = '';
    state.booting = false;

    inputLineContainer.style.opacity = '1';
    input.focus();
    showWelcomeScreen();
}

export function showWelcomeScreen() {
    const logo = `
  _______   _____ _           _
 |__   __| / ____| |         | |
    | |   | |    | |__   __ _| |_
    | |   | |    | '_ \\ / _\` | __|
    | |   | |____| | | | (_| | |_
    |_|    \\_____|_| |_|\\__,_|\\__|  v2.0
            `;
    addMessage(null, logo, false, false, false, true);
    addMessage('SYSTEM', 'WELCOME, USER.', true);
    addMessage(null, '------------------------------------------------');
    addMessage(null, 'QUICK START GUIDE:');
    addMessage(null, '1. LOGIN:        Type "login" to sign in with Google.');
    addMessage(null, '2. COMMANDS:     Type "help" to see available tools.');
    addMessage(null, '3. SHORTCUTS:    Press [TAB] to autocomplete commands.');
    addMessage(null, '4. EMOJIS:       Type "(" and [TAB] to see the menu.');
    addMessage(null, '                 Ex: (tableflip) -> (ノ ゜Д゜)ノ ︵ ┻━┻');
    addMessage(null, '------------------------------------------------');

    if (state.currentUser && !state.currentUser.isAnonymous) {
        addMessage('SYSTEM', `SESSION RESTORED: ${state.currentUser.email}`, true);
    }
    addMessage('SYSTEM', 'SYSTEM READY. AWAITING INPUT...', true);
}

// Re-export for convenience
export { applyTheme, SoundSys };
