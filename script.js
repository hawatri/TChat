import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signInAnonymously, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, addDoc, query, where, onSnapshot, orderBy, serverTimestamp, setDoc, doc, getDocs, getDoc, deleteDoc, limit, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- IMPORTS ---
import { app, auth, db, appId } from './firebase-config.js';
import { bootText, commandsList, subCommands, EMOJI_MAP } from './data.js';
import { SoundSys, applyTheme, fetchAscii, convertImageToAscii } from './utils.js';

// --- State ---
let currentUser = null;
let currentChatPartner = null; 
let messagesUnsubscribe = null;
let notificationUnsubscribe = null;
let channelMetaUnsubscribe = null; // For radio channel metadata
let activeRadioParticipants = new Set(); // Stores display names for radio autocomplete
let currentChannelAdmins = []; // Array of Admin UIDs for current radio

const state = {
    mode: 'COMMAND', // COMMAND, CHAT, RADIO, PROFILE_EDIT
    muted: false,
    booting: true, 
    theme: 'green'
};

// --- Command History ---
const cmdHistory = [];
let historyIndex = -1;

// --- Autocomplete Data ---
let autocompleteOptions = [];
let autocompleteIndex = -1;

// --- UI References ---
const input = document.getElementById('command-input');
const inputLineContainer = document.getElementById('input-line-container');
const history = document.getElementById('chat-history');
const container = document.getElementById('terminal-container');
const promptSpan = document.getElementById('prompt-span');
const cmdBefore = document.getElementById('cmd-before');
const cmdCursor = document.getElementById('cmd-cursor');
const cmdAfter = document.getElementById('cmd-after');
const autocompleteMenu = document.getElementById('autocomplete-menu');
const fileInput = document.getElementById('file-upload'); 
const tabBtn = document.getElementById('tab-btn');
const editorOverlay = document.getElementById('profile-editor-overlay');
const crtOverlay = document.getElementById('crt-overlay');

// Editor Refs
const editNick = document.getElementById('edit-nick');
const editBio = document.getElementById('edit-bio');
const editAvatar = document.getElementById('edit-avatar');
const editorElements = [
    document.getElementById('row-nick'), 
    document.getElementById('row-bio'), 
    document.getElementById('row-avatar'),
    document.getElementById('btn-save'),
    document.getElementById('btn-cancel')
];

let editorSelection = 0;
let editorIsEditing = false;
let editorBuffer = '';
let editorAvatarBuffer = null;

function updateInputDisplay() {
    if (state.mode === 'PROFILE_EDIT') return; // Don't update main input display in edit mode

    const val = input.value;
    const selStart = input.selectionStart || 0;
    const left = val.substring(0, selStart);
    const char = val.substring(selStart, selStart + 1) || '\u00A0';
    const right = val.substring(selStart + 1);

    cmdBefore.textContent = left;
    cmdCursor.textContent = char;
    cmdAfter.textContent = right;
}

['input', 'click', 'focus', 'blur'].forEach(evt => {
    input.addEventListener(evt, () => requestAnimationFrame(updateInputDisplay));
});

// --- Tab Button Logic ---
tabBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (state.mode === 'PROFILE_EDIT') {
         handleProfileEditorKey({ key: 'Tab', preventDefault: () => {} });
    } else {
        input.focus(); 
        handleTabCompletion({ preventDefault: () => {} });
    }
});

// --- File Upload Handler ---
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // IF IN EDITOR MODE
    if (state.mode === 'PROFILE_EDIT') {
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                 const ascii = await convertImageToAscii(event.target.result);
                 editorAvatarBuffer = ascii;
                 editAvatar.textContent = "[ IMAGE SET (ASCII GENERATED) ]";
            } catch(e) {
                 editAvatar.textContent = "[ ERROR CONVERTING ]";
            }
            fileInput.value = '';
        };
        reader.readAsDataURL(file);
        return;
    }
    
    // NORMAL CHAT MODE
    addMessage('SYSTEM', `PROCESSING IMAGE: ${file.name}...`, true);
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const ascii = await convertImageToAscii(event.target.result);
            if (state.mode === 'COMMAND') {
                addMessage(null, ascii, false, false, false, true);
            } else {
                await sendMessage(ascii, true, false); 
            }
        } catch(err) {
            addMessage('ERROR', 'CONVERSION FAILED: ' + err.message, false, false, true);
        }
        fileInput.value = ''; 
    };
    reader.readAsDataURL(file);
});

// --- Autocomplete Logic ---
function showAutocompleteMenu(options) {
    autocompleteMenu.innerHTML = '';
    autocompleteOptions = options;
    autocompleteIndex = -1;

    if (options.length === 0) {
        autocompleteMenu.style.display = 'none';
        return;
    }

    options.forEach((opt, index) => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.textContent = opt;
        div.onclick = () => confirmSelection(opt);
        autocompleteMenu.appendChild(div);
    });

    autocompleteMenu.style.display = 'flex';
}

function hideAutocomplete() {
    autocompleteMenu.style.display = 'none';
    autocompleteOptions = [];
    autocompleteIndex = -1;
}

function highlightOption(index) {
    const items = autocompleteMenu.children;
    for (let i = 0; i < items.length; i++) {
        items[i].classList.remove('selected');
    }
    if (index >= 0 && index < items.length) {
        items[index].classList.add('selected');
        items[index].scrollIntoView({ block: 'nearest' });
    }
}

function confirmSelection(selectedValue) {
    const val = input.value;
    
    // Special handling for @(Mention) to support spaces
    if (selectedValue.startsWith('@(')) {
        // Find the last occurrence of '@(' to replace
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

function handleTabCompletion(e) {
    e.preventDefault();

    if (autocompleteMenu.style.display === 'flex') {
        autocompleteIndex = (autocompleteIndex + 1) % autocompleteOptions.length;
        highlightOption(autocompleteIndex);
        return;
    }

    const val = input.value;
    let matches = [];

    // 1. Check for Mention: @(...)
    const mentionMatch = val.match(/@\(([^)]*)$/);
    
    if (mentionMatch && state.mode === 'RADIO') {
        const term = mentionMatch[1].toLowerCase(); // text inside ( )
        const participants = Array.from(activeRadioParticipants);
        matches = participants
            .filter(name => name.toLowerCase().startsWith(term))
            .map(name => `@(${name})`);
    }
    else {
        const parts = val.split(' '); 
        const currentWord = parts[parts.length - 1]; 

        if (currentWord.startsWith('(')) {
            const emojiKeys = Object.keys(EMOJI_MAP);
            matches = emojiKeys.filter(key => key.startsWith(currentWord));
        }
        else if (parts.length === 1 && currentWord !== "") {
             matches = commandsList.filter(cmd => cmd.startsWith(currentWord));
        }
        else if (parts.length === 2 && !currentWord.startsWith('(')) {
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

// --- Boot Sequence & Auth ---

async function runBootSequence() {
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

function showWelcomeScreen() {
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
    
    if (currentUser && !currentUser.isAnonymous) {
        addMessage('SYSTEM', `SESSION RESTORED: ${currentUser.email}`, true);
    }
    
    addMessage('SYSTEM', 'SYSTEM READY. AWAITING INPUT...', true);
}

const initGuestAuth = async () => {
    try { await signInAnonymously(auth); } 
    catch (e) { console.warn("Guest login failed:", e.code); }
};

const updateStatus = async (status) => {
    if (!currentUser || currentUser.isAnonymous) return;
    try {
        const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'user_profiles', currentUser.uid);
        await setDoc(userRef, {
            status: status,
            lastSeen: serverTimestamp()
        }, { merge: true });
        return true;
    } catch(e) { console.error(e); return false; }
};

// --- Notification Listener ---
function setupNotificationListener(uid) {
    if (notificationUnsubscribe) notificationUnsubscribe();
    
    const notifRef = collection(db, 'artifacts', appId, 'users', uid, 'notifications');
    const q = query(notifRef, orderBy('timestamp', 'desc'), limit(1));
    
    notificationUnsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const notif = change.doc.data();
                if (notif.timestamp && (Date.now() - notif.timestamp.toMillis()) < 30000) {
                    triggerNotificationEffect(notif);
                }
            }
        });
    });
}

function triggerNotificationEffect(notif) {
    SoundSys.alert();
    crtOverlay.classList.add('notification-flash');
    setTimeout(() => crtOverlay.classList.remove('notification-flash'), 500);
    addMessage('ALERT', `MENTIONED BY [${notif.fromName}]: "${notif.preview}"`, true);
}

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
        if (user.isAnonymous) {
             updatePrompt('guest');
             if (!state.booting) addMessage('SYSTEM', 'GUEST MODE ACTIVE.', true);
        } else {
            updatePrompt(user.email.split('@')[0]);
            if (!state.booting) addMessage('SYSTEM', `AUTHENTICATED AS ${user.email}`, true);
            
            await updateStatus('online');
            setupNotificationListener(user.uid);

            try {
                const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'user_profiles', user.uid);
                const snap = await getDoc(userRef);
                const baseData = {
                    email: user.email,
                    displayName: user.displayName || user.email.split('@')[0],
                    uid: user.uid,
                    status: 'online',
                    lastSeen: serverTimestamp()
                };
                
                if (!snap.exists() || !snap.data().joinedAt) {
                    baseData.joinedAt = serverTimestamp();
                }
                
                await setDoc(userRef, baseData, { merge: true });
            } catch (e) {}
        }
    } else {
        updatePrompt('offline');
        initGuestAuth();
        if (notificationUnsubscribe) notificationUnsubscribe();
    }
});

window.onload = runBootSequence;

const handleLogin = async () => {
    try {
        addMessage('SYSTEM', 'INITIATING GOOGLE AUTH HANDSHAKE...', true);
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    } catch (error) {
        if (error.code === 'auth/unauthorized-domain') {
            addMessage('ERROR', 'DOMAIN NOT AUTHORIZED. Check Firebase Console.', false, false, true);
        } else {
            addMessage('ERROR', `LOGIN FAILED: ${error.message}`, false, false, true);
        }
    }
};

function updatePrompt(username) {
    if (state.mode === 'CHAT') {
        const name = currentChatPartner.nickname || currentChatPartner.email;
        promptSpan.textContent = `[CHAT:${name}] >`;
        input.style.caretColor = 'var(--chat-color)';
    } else if (state.mode === 'RADIO') {
        const name = currentChatPartner.frequency;
        promptSpan.textContent = `[RADIO:${name}] >`;
        input.style.caretColor = 'var(--radio-color)';
    } else {
        promptSpan.textContent = `${username}@TChat:~$`;
        input.style.caretColor = 'var(--terminal-main)';
    }
}

// --- Effects ---
function parseEmojis(text) {
     return text.replace(/\([^)]+\)/g, (match) => EMOJI_MAP[match] || match);
}

function scrambleText(element, finalValidText, finalHTML = null) {
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
        
        iterations += 1/3 + (originalText.length / 300); 
    }, 60); 
}

const msgMap = new Map();

function addMessage(sender, text, isSystem = false, isChat = false, isError = false, isAscii = false, msgId = null, isBurn = false, isRadio = false) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message-line');
    if (isSystem) msgDiv.classList.add('system-msg');
    if (isChat) msgDiv.classList.add('chat-msg');
    if (isRadio) msgDiv.classList.add('radio-msg');
    if (isError) msgDiv.classList.add('error-msg');
    if (isAscii) msgDiv.classList.add('ascii-art');

    if (msgId) {
        msgDiv.setAttribute('data-msg-id', msgId);
        msgMap.set(msgId, msgDiv);
    }

    if (!state.muted && (isSystem || (isChat && sender !== 'ME') || (isRadio && sender !== 'ME'))) {
        setTimeout(() => SoundSys.blip(), 50);
    }

    const contentSpan = document.createElement('span');

    if (sender) {
        let prefixColor = 'var(--terminal-main)';
        
        if (isChat) {
            prefixColor = (sender === 'ME') ? 'var(--terminal-main)' : 'var(--chat-color)';
        }
        
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
            if(left >= 0) burnSpan.textContent = ` [${left}s]`;
            else {
                clearInterval(timer);
            }
        }, 1000);
    }

    history.appendChild(msgDiv);
    scrollToBottom();

    if ((isChat && sender !== 'ME') || isSystem || (isRadio && sender !== 'ME')) {
        if (!isAscii) scrambleText(contentSpan, text, finalHTML);
    }

    return msgDiv;
}

function scrollToBottom() {
    history.scrollTop = history.scrollHeight;
}

// --- Command Processing ---

document.addEventListener('keydown', (event) => {
    if (state.mode === 'PROFILE_EDIT') {
        handleProfileEditorKey(event);
        return;
    }
});

input.addEventListener('keydown', function(event) {
    if (state.mode === 'PROFILE_EDIT') return;

    SoundSys.init();
    
    if (event.key === 'Tab') {
        handleTabCompletion(event);
        return; 
    }

    if (autocompleteMenu.style.display === 'flex') {
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            autocompleteIndex = (autocompleteIndex - 1 + autocompleteOptions.length) % autocompleteOptions.length;
            highlightOption(autocompleteIndex);
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            autocompleteIndex = (autocompleteIndex + 1) % autocompleteOptions.length;
            highlightOption(autocompleteIndex);
            return;
        }
        if (event.key === 'Enter') {
            if (autocompleteIndex >= 0) {
                event.preventDefault();
                confirmSelection(autocompleteOptions[autocompleteIndex]);
                return;
            }
            hideAutocomplete();
        }
        if (event.key === 'Escape') {
            hideAutocomplete();
            return;
        }
    } else {
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (cmdHistory.length > 0) {
                if (historyIndex < cmdHistory.length - 1) {
                    historyIndex++;
                    input.value = cmdHistory[cmdHistory.length - 1 - historyIndex];
                    updateInputDisplay();
                }
            }
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (historyIndex > 0) {
                historyIndex--;
                input.value = cmdHistory[cmdHistory.length - 1 - historyIndex];
            } else if (historyIndex === 0) {
                historyIndex = -1;
                input.value = '';
            }
            updateInputDisplay();
            return;
        }
    }

    if (event.key.length === 1 || event.key === 'Backspace') {
         if (event.key !== 'Tab') hideAutocomplete();
    }

    if (!['Enter', 'Shift', 'Control', 'Alt', 'ArrowUp', 'ArrowDown', 'Tab'].includes(event.key)) {
        SoundSys.click();
    }

    if (event.key === 'Enter') {
        const text = input.value; 
        const trimmed = text.trim();
        
        if (event.shiftKey) {
            return;
        }

        if (trimmed !== "") {
            cmdHistory.push(trimmed);
            historyIndex = -1;

            if (state.mode === 'COMMAND') {
                addMessage('ME', trimmed);
                processCommand(trimmed);
            } else {
                processChatInput(trimmed);
            }
            input.value = '';
            updateInputDisplay();
        }
        event.preventDefault(); 
    }
    requestAnimationFrame(updateInputDisplay);
});

document.addEventListener('click', (e) => { 
    if (state.mode === 'PROFILE_EDIT') return;

    input.focus(); 
    SoundSys.init();
    if (e.target !== autocompleteMenu && e.target.parentElement !== autocompleteMenu && e.target !== tabBtn) {
        hideAutocomplete();
    }
});

// --- Profile Editor Logic ---
function openProfileEditor() {
    if (!ensureAuth()) return;
    state.mode = 'PROFILE_EDIT';
    editorOverlay.style.display = 'flex';
    
    const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'user_profiles', currentUser.uid);
    getDoc(userRef).then(snap => {
        if(snap.exists()) {
            const d = snap.data();
            editNick.textContent = d.displayName || '';
            editBio.textContent = d.bio || '';
            if (d.avatarAscii) {
                editorAvatarBuffer = d.avatarAscii;
                editAvatar.textContent = "[ IMAGE SET ]";
            }
        }
    });

    editorSelection = 0;
    editorIsEditing = false;
    updateEditorVisuals();
    setupEditorClicks(); 
}

function closeProfileEditor() {
    state.mode = 'COMMAND';
    editorOverlay.style.display = 'none';
    editorIsEditing = false;
    input.focus();
}

async function saveProfileEditor() {
    addMessage('SYSTEM', 'SAVING PROFILE...', true);
    const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'user_profiles', currentUser.uid);
    
    const rawNick = editNick.textContent.trim();
    const dataToUpdate = {
        displayName: rawNick,
        displayNameLower: rawNick.toLowerCase(),
        bio: editBio.textContent.trim(),
    };
    
    if (editorAvatarBuffer) {
        dataToUpdate.avatarAscii = editorAvatarBuffer;
    }
    
    await setDoc(userRef, dataToUpdate, { merge: true });
    
    addMessage('SYSTEM', 'PROFILE UPDATED SUCCESSFULLY.', true);
    closeProfileEditor();
}

function updateEditorVisuals() {
    editorElements.forEach(el => {
        el.classList.remove('active');
        el.classList.remove('editing');
    });

    const currentEl = editorElements[editorSelection];
    currentEl.classList.add('active');
    
    if (editorIsEditing) {
        currentEl.classList.add('editing');
    }
}

function setupEditorClicks() {
    document.getElementById('row-nick').onclick = () => handleEditorInteraction(0);
    document.getElementById('row-bio').onclick = () => handleEditorInteraction(1);
    document.getElementById('row-avatar').onclick = () => handleEditorInteraction(2);
    document.getElementById('btn-save').onclick = () => handleEditorInteraction(3);
    document.getElementById('btn-cancel').onclick = () => handleEditorInteraction(4);
}

function handleEditorInteraction(index) {
    if (editorSelection !== index) {
        editorSelection = index;
        editorIsEditing = false;
        SoundSys.blip();
        updateEditorVisuals();
        return;
    }

    SoundSys.click();
    
    if (index === 0) { 
        activateInlineInput(editNick);
    } 
    else if (index === 1) { 
        activateInlineInput(editBio);
    }
    else if (index === 2) { 
        fileInput.click();
    }
    else if (index === 3) { 
        saveProfileEditor();
    }
    else if (index === 4) { 
        closeProfileEditor();
    }
}

function activateInlineInput(element) {
    if (element.querySelector('input')) return;

    editorIsEditing = true;
    const currentText = element.textContent;
    element.textContent = ''; 
    
    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.value = currentText;
    inputEl.className = 'terminal-inline-input';
    
    inputEl.addEventListener('blur', () => {
        commitInlineInput(element, inputEl);
    });
    
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            inputEl.blur(); 
        }
        else if (e.key === 'Tab') {
            e.preventDefault();
            inputEl.blur(); 
            editorSelection = (editorSelection + 1) % editorElements.length;
            SoundSys.blip();
            updateEditorVisuals();
        }
        e.stopPropagation(); 
    });
    
    inputEl.addEventListener('click', (e) => e.stopPropagation()); 

    element.appendChild(inputEl);
    inputEl.focus();
    updateEditorVisuals();
}

function commitInlineInput(wrapperElement, inputElement) {
    const val = inputElement.value;
    wrapperElement.textContent = val;
    editorIsEditing = false;
    updateEditorVisuals();
}

function handleProfileEditorKey(e) {
    if (editorIsEditing) {
        return; 
    }

    if (e.key === 'Tab' || e.key === 'ArrowDown') {
        e.preventDefault();
        editorSelection = (editorSelection + 1) % editorElements.length;
        SoundSys.blip();
        updateEditorVisuals();
    } else if (e.key === 'ArrowUp') {
         e.preventDefault();
         editorSelection = (editorSelection - 1 + editorElements.length) % editorElements.length;
         SoundSys.blip();
         updateEditorVisuals();
    }
    else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        SoundSys.click();
        
        if (editorSelection === 0) activateInlineInput(editNick);
        else if (editorSelection === 1) activateInlineInput(editBio);
        else if (editorSelection === 2) fileInput.click();
        else if (editorSelection === 3) saveProfileEditor();
        else if (editorSelection === 4) closeProfileEditor();
    }
}

async function processCommand(rawCmd) {
    const parts = rawCmd.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
        case 'help':
                    addMessage('SYSTEM', 'COMMANDS:', true);
                    addMessage(null, '  login            - Sign in with Google');
                    addMessage(null, '  logout           - Sign out');
                    addMessage(null, '  set-bio          - Open Profile Editor');
                    addMessage(null, '  whois [email]    - View User Profile');
                    addMessage(null, '  mentions         - Check tags/mentions');
                    addMessage(null, '  friend add [email]     - Add friend');
                    addMessage(null, '  friend nick [email] [nick] - Set nickname');
                    addMessage(null, '  friends          - List friends');
                    addMessage(null, '  friends-email    - List emails & nicknames');
                    addMessage(null, '  reqbox           - Check for new messages');
                    addMessage(null, '  status [mode]    - online/away/busy');
                    addMessage(null, '  chat [name/email] - Start chat');
                    addMessage(null, '  radio [freq]     - Join broadcast freq');
                    addMessage(null, '  host             - Claim Radio Host (*)');
                    addMessage(null, '  host [name]      - Add Admin (Host only)');
                    addMessage(null, '  unhost [name]    - Remove Admin (Host only)');
                    addMessage(null, '  kick [name]      - Ban User (Admin only)');
                    addMessage(null, '  unkick [name]    - Unban User (Admin only)');
                    addMessage(null, '  host-list        - Show Admins');
                    addMessage(null, '  ping [email]     - Check user availability');
                    addMessage(null, '  neofetch         - Display system info');
                    addMessage(null, '  burn [msg]       - Send self-destruct msg');
                    addMessage(null, '  theme [color]    - Set color');
                    addMessage(null, '  ascii [url]      - Render ASCII (Image or Text)');
                    addMessage(null, '                     Type "ascii" with no url to upload.'); // Updated Help
                    addMessage(null, '  emoji            - List emoji codes');
                    addMessage(null, '  mute / unmute    - Toggle sounds');
                    addMessage(null, '  clear            - Clear screen');
                    break;

        case 'clear':
            history.innerHTML = '';
            break;

        case 'set-bio':
            openProfileEditor();
            break;

        case 'whois':
            if (args[0]) {
                await runWhois(args[0]);
            } else {
                await runWhois(currentUser.email);
            }
            break;

        case 'mentions':
            await showRecentMentions();
            break;

        case 'emoji':
            addMessage('SYSTEM', 'AVAILABLE EMOJIS (Type code to use):', true);
            const emojiList = Object.keys(EMOJI_MAP).join(' ');
            addMessage(null, emojiList);
            break;

        case 'status':
            if (!ensureAuth()) return;
            const validStatuses = ['online', 'away', 'busy'];
            if (args[0] && validStatuses.includes(args[0])) {
                await updateStatus(args[0]);
                addMessage('SYSTEM', `STATUS SET TO: ${args[0].toUpperCase()}`, true);
            } else {
                addMessage('SYSTEM', 'USAGE: status [online | away | busy]', true);
            }
            break;

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

        case 'theme':
            if (args[0] && applyTheme(args[0])) {
                addMessage('SYSTEM', `THEME SET TO ${args[0].toUpperCase()}`, true);
            } else {
                addMessage('SYSTEM', 'USAGE: theme [green|amber|blue|white|matrix]', true);
            }
            break;

        case 'login':
            if (currentUser && !currentUser.isAnonymous) {
                addMessage('SYSTEM', 'ALREADY LOGGED IN.', true);
            } else {
                await handleLogin();
            }
            break;

        case 'logout':
            if (currentUser && !currentUser.isAnonymous) {
                try {
                    await signOut(auth);
                    addMessage('SYSTEM', 'LOGGED OUT. REVERTING TO GUEST MODE...', true);
                } catch (e) {
                    addMessage('ERROR', 'LOGOUT FAILED: ' + e.message, false, false, true);
                }
            } else {
                addMessage('SYSTEM', 'ALREADY IN GUEST MODE.', true);
            }
            break;

        case 'friend':
            if (!ensureAuth()) return;
            if (args[0] === 'add' && args[1]) {
                addFriend(args[1]);
            } else if (args[0] === 'nick' && args[1] && args[2]) {
                setNickname(args[1], args[2]);
            } else {
                addMessage('SYSTEM', 'USAGE: friend add [email] OR friend nick [email] [nick]', true);
            }
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
            if (args[0]) {
                startChat(args[0]);
            } else {
                addMessage('SYSTEM', 'USAGE: chat [name/email]', true);
            }
            break;
        
        case 'radio':
            if (!ensureAuth()) return;
            if (args[0]) {
                joinRadio(args[0]);
            } else {
                addMessage('SYSTEM', 'USAGE: radio [frequency] (e.g. 101.5)', true);
            }
            break;
        
        case 'host':
            if (args.length > 0) {
                let target = args.join(' ');
                const match = target.match(/@\((.*?)\)/);
                if(match) target = match[1];
                await promoteUser(target);
            } else {
                await claimRadioHost();
            }
            break;
        
        case 'unhost':
            if (args.length > 0) {
                let target = args.join(' ');
                const match = target.match(/@\((.*?)\)/);
                if(match) target = match[1];
                await demoteUser(target);
            } else {
                addMessage('SYSTEM', 'USAGE: unhost [username]', true);
            }
            break;
        
        case 'kick':
            if (args.length > 0) {
                let target = args.join(' ');
                const match = target.match(/@\((.*?)\)/);
                if(match) target = match[1];
                await kickUser(target);
            } else {
                addMessage('SYSTEM', 'USAGE: kick [username]', true);
            }
            break;
        
        case 'unkick':
            if (args.length > 0) {
                let target = args.join(' ');
                const match = target.match(/@\((.*?)\)/);
                if(match) target = match[1];
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
            if (args[0]) {
                await pingUser(args[0]);
            } else {
                addMessage('SYSTEM', 'USAGE: ping [email]', true);
            }
            break;

        case 'exit':
            if (state.mode === 'CHAT' || state.mode === 'RADIO') {
                if (messagesUnsubscribe) messagesUnsubscribe();
                if (channelMetaUnsubscribe) channelMetaUnsubscribe();
                messagesUnsubscribe = null;
                channelMetaUnsubscribe = null;
                
                state.mode = 'COMMAND';
                currentChatPartner = null;
                
                history.innerHTML = ''; 
                addMessage('SYSTEM', 'DISCONNECTED.', true);
                
                const name = currentUser && !currentUser.isAnonymous 
                    ? (currentUser.displayName || currentUser.email.split('@')[0]) 
                    : 'guest';
                updatePrompt(name);
            }
            break;

        default:
            addMessage('SYSTEM', `UNKNOWN COMMAND: ${cmd}`, true);
    }
}

function ensureAuth() {
    if (!currentUser || currentUser.isAnonymous) {
        addMessage('ERROR', 'ACCESS DENIED. LOGIN REQUIRED.', false, false, true);
        return false;
    }
    return true;
}

// --- Feature Implementation ---

async function showRecentMentions() {
    if (!ensureAuth()) return;
    addMessage('SYSTEM', 'FETCHING RECENT MENTIONS...', true);
    
    try {
        const notifRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'notifications');
        const q = query(notifRef, limit(10)); 
        
        const snap = await getDocs(q);
        
        if (snap.empty) {
            addMessage(null, 'NO RECENT MENTIONS FOUND.');
            return;
        }
        
        const notifs = [];
        snap.forEach(doc => notifs.push(doc.data()));
        notifs.sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        
        notifs.forEach(data => {
            const time = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleTimeString() : '??:??';
            addMessage(null, `[${time}] ${data.fromName}: ${data.preview}`);
        });
        
    } catch(e) {
        addMessage('ERROR', 'FAILED: ' + e.message, false, false, true);
    }
}

async function runWhois(identifier) {
    addMessage('SYSTEM', `QUERYING DIRECTORY FOR: ${identifier}...`, true);
    
    try {
        const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'user_profiles');
        let q = query(usersRef, where("email", "==", identifier));
        let snapshot = await getDocs(q);
        
        if (snapshot.empty) {
             addMessage('ERROR', 'USER NOT FOUND.', false, false, true);
             return;
        }
        
        const d = snapshot.docs[0].data();
        const joined = d.joinedAt ? new Date(d.joinedAt.seconds * 1000).toLocaleDateString() : 'Unknown';
        const status = d.status ? d.status.toUpperCase() : 'OFFLINE';
        
        addMessage(null, `+-----------------------------------------+`);
        addMessage(null, `| USER:   ${d.displayName || d.email}`);
        addMessage(null, `| EMAIL:  ${d.email}`);
        addMessage(null, `| STATUS: ${status}`);
        addMessage(null, `| SINCE:  ${joined}`);
        addMessage(null, `+-----------------------------------------+`);
        
        if (d.bio) {
            addMessage(null, `BIO:\n${d.bio}`);
            addMessage(null, `+-----------------------------------------+`);
        }
        
        if (d.avatarAscii) {
            addMessage(null, `AVATAR:`);
            addMessage(null, d.avatarAscii, false, false, false, true);
            addMessage(null, `+-----------------------------------------+`);
        }

    } catch(e) {
         addMessage('ERROR', 'WHOIS FAILED: ' + e.message, false, false, true);
    }
}

function runNeofetch() {
    const now = performance.now();
    const uptimeMins = Math.floor(now / 60000);
    const uptimeSecs = Math.floor((now % 60000) / 1000);
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    let os = 'Unknown OS';
    if (navigator.userAgent.indexOf("Win") != -1) os = "Windows";
    if (navigator.userAgent.indexOf("Mac") != -1) os = "MacOS";
    if (navigator.userAgent.indexOf("Linux") != -1) os = "Linux";
    if (navigator.userAgent.indexOf("Android") != -1) os = "Android";
    if (navigator.userAgent.indexOf("like Mac") != -1) os = "iOS";

    let browser = 'Unknown Browser';
    if (navigator.userAgent.indexOf("Chrome") != -1) browser = "Chrome";
    if (navigator.userAgent.indexOf("Firefox") != -1) browser = "Firefox";
    if (navigator.userAgent.indexOf("Safari") != -1 && navigator.userAgent.indexOf("Chrome") == -1) browser = "Safari";

    const user = currentUser ? (currentUser.displayName || currentUser.email.split('@')[0]) : 'guest';
    const authStatus = currentUser && !currentUser.isAnonymous ? 'Authenticated' : 'Anonymous';
    const email = currentUser && !currentUser.isAnonymous ? currentUser.email : 'N/A';

    const logo = [
        "   _______   ",
        "  |__   __|  ",
        "     | |     ",
        "     | |     ",
        "     | |     ",
        "     |_|     "
    ];

    const info = [
        `USER:    ${user}@tchat`,
        `--------`,
        `OS:      ${os} (Web Kernel)`,
        `BROWSER: ${browser}`,
        `UPTIME:  ${uptimeMins}m ${uptimeSecs}s`,
        `RES:     ${width}x${height}`,
        `THEME:   ${state.theme}`,
        `STATUS:  ${authStatus}`,
        `EMAIL:   ${email}`
    ];

    let output = "";
    const logoWidth = 16;
    const maxLines = Math.max(logo.length, info.length);
    
    for(let i=0; i<maxLines; i++) {
        const logoLine = (logo[i] || "").padEnd(logoWidth, " ");
        const infoLine = info[i] || "";
        output += `${logoLine}  ${infoLine}\n`;
    }

    output += "\n   \u001b[31m███\u001b[32m███\u001b[33m███\u001b[34m███\u001b[35m███\u001b[36m███";
    
    addMessage(null, output, false, false, false, true);
}

async function pingUser(targetEmail) {
    addMessage('SYSTEM', `PINGING ${targetEmail}...`, true);
    const start = Date.now();
    try {
        const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'user_profiles');
        const q = query(usersRef, where("email", "==", targetEmail));
        const snapshot = await getDocs(q);
        
        const ms = Date.now() - start;

        if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            const status = data.status ? data.status.toUpperCase() : 'UNKNOWN';
            addMessage('SYSTEM', `REPLY FROM ${targetEmail}: status=${status} time=${ms}ms`, true);
        } else {
            addMessage('ERROR', `REQUEST TIMED OUT: ${targetEmail} not found.`, false, false, true);
        }
    } catch (error) {
        addMessage('ERROR', 'PING ERROR: ' + error.message, false, false, true);
    }
}

async function addFriend(targetEmail) {
    addMessage('SYSTEM', `SEARCHING...`, true);
    try {
        const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'user_profiles');
        const q = query(usersRef, where("email", "==", targetEmail));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            addMessage('ERROR', 'USER NOT FOUND.', false, false, true);
            return;
        }
        const targetUser = snapshot.docs[0].data();
        const myFriendsRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'friends', targetUser.uid);
        await setDoc(myFriendsRef, {
            email: targetUser.email,
            uid: targetUser.uid,
            displayName: targetUser.displayName,
            addedAt: serverTimestamp()
        }, { merge: true });
        addMessage('SYSTEM', `FRIEND ADDED.`, true);
    } catch (error) {
        addMessage('ERROR', 'DB ERROR: ' + error.message, false, false, true);
    }
}

async function setNickname(targetEmail, nickname) {
    addMessage('SYSTEM', `SETTING NICKNAME...`, true);
    try {
        const friendsRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'friends');
        const q = query(friendsRef, where("email", "==", targetEmail));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            addMessage('ERROR', 'FRIEND NOT FOUND IN LIST. ADD FIRST.', false, false, true);
            return;
        }

        const friendDoc = snapshot.docs[0];
        await setDoc(friendDoc.ref, { nickname: nickname }, { merge: true });
        addMessage('SYSTEM', `NICKNAME SET: ${nickname} -> ${targetEmail}`, true);
    } catch (error) {
        addMessage('ERROR', 'UPDATE FAILED: ' + error.message, false, false, true);
    }
}

async function listFriends() {
    addMessage('SYSTEM', 'FETCHING FRIEND LIST...', true);
    try {
        const friendsRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'friends');
        const snapshot = await getDocs(friendsRef);
        if (snapshot.empty) {
            addMessage(null, 'No friends found.');
            return;
        }
        
        const promises = snapshot.docs.map(async (docSnap) => {
            const friend = docSnap.data();
            const profileRef = doc(db, 'artifacts', appId, 'public', 'data', 'user_profiles', friend.uid);
            const profileSnap = await getDoc(profileRef);
            let status = 'offline';
            if (profileSnap.exists()) {
                status = profileSnap.data().status || 'offline';
            }
            return { ...friend, status };
        });

        const friendsWithStatus = await Promise.all(promises);

        friendsWithStatus.forEach(f => {
            let dotClass = 'status-online'; 
            if (f.status === 'away') dotClass = 'status-away';
            if (f.status === 'busy') dotClass = 'status-busy';
            
            const displayName = f.nickname ? `${f.nickname} <${f.email}>` : f.email;
            
            const div = document.createElement('div');
            div.className = 'message-line';
            div.innerHTML = `<span class="status-dot ${dotClass}">●</span> ${displayName}`;
            history.appendChild(div);
        });
        scrollToBottom();

    } catch (error) {
        addMessage('ERROR', error.message, false, false, true);
    }
}

async function listFriendsEmails() {
    addMessage('SYSTEM', 'FETCHING CONTACTS...', true);
    try {
        const friendsRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'friends');
        const snapshot = await getDocs(friendsRef);
        if (snapshot.empty) {
            addMessage(null, 'No friends found.');
            return;
        }
        
        snapshot.forEach(docSnap => {
            const f = docSnap.data();
            const info = f.nickname ? `NICK: ${f.nickname} | EMAIL: ${f.email}` : `EMAIL: ${f.email}`;
            addMessage(null, info);
        });
        scrollToBottom();

    } catch (error) {
        addMessage('ERROR', error.message, false, false, true);
    }
}

async function checkReqBox() {
    addMessage('SYSTEM', 'SCANNING FREQUENCIES (REQBOX)...', true);
    try {
        const friendsRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'friends');
        const friendsSnap = await getDocs(friendsRef);
        const friendMap = new Map();
        friendsSnap.forEach(doc => {
            const data = doc.data();
            friendMap.set(data.uid, data);
        });

        const msgsRef = collection(db, 'artifacts', appId, 'public', 'data', 'messages');
        const q = query(msgsRef, where('receiverId', '==', currentUser.uid));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            addMessage(null, 'NO MESSAGES FOUND.');
            return;
        }

        const senders = new Set();
        snapshot.forEach(doc => {
            senders.add(doc.data().senderId);
        });

        if (senders.size === 0) {
            addMessage(null, 'NO MESSAGES FOUND.');
            return;
        }

        addMessage(null, `FOUND MESSAGES FROM ${senders.size} USER(S):`);

        for (const uid of senders) {
            if (friendMap.has(uid)) {
                const friend = friendMap.get(uid);
                const displayName = friend.nickname ? `${friend.nickname} <${friend.email}>` : friend.email;
                addMessage(null, `> [FRIEND] ${displayName}`);
            } else {
                const profileRef = doc(db, 'artifacts', appId, 'public', 'data', 'user_profiles', uid);
                const snap = await getDoc(profileRef);
                if (snap.exists()) {
                    const data = snap.data();
                    addMessage(null, `> [NEW]    ${data.email}`);
                } else {
                    addMessage(null, `> [NEW]    UNKNOWN_USER [${uid.slice(0,5)}..]`);
                }
            }
        }
        
        addMessage('SYSTEM', "TYPE 'chat [email/nick]' TO REPLY.", true);

    } catch (error) {
        console.error(error);
        if (error.message.includes('index')) {
             addMessage('ERROR', 'INDEX MISSING. CHECK CONSOLE.', false, false, true);
        } else {
             addMessage('ERROR', 'SCAN FAILED: ' + error.message, false, false, true);
        }
    }
}

async function startChat(identifier) {
    try {
        let friendData = null;
        
        const friendsRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'friends');
        let q = query(friendsRef, where("nickname", "==", identifier));
        let snapshot = await getDocs(q);

        if (!snapshot.empty) {
            friendData = snapshot.docs[0].data();
        } else {
            q = query(friendsRef, where("email", "==", identifier));
            snapshot = await getDocs(q);
            if (!snapshot.empty) {
                friendData = snapshot.docs[0].data();
            }
        }

        if (!friendData) {
            const publicUsersRef = collection(db, 'artifacts', appId, 'public', 'data', 'user_profiles');
            const qPub = query(publicUsersRef, where("email", "==", identifier));
            const snapPub = await getDocs(qPub);
            
            if (!snapPub.empty) {
                friendData = snapPub.docs[0].data();
                addMessage('SYSTEM', 'USER FOUND IN PUBLIC DIRECTORY (NOT IN FRIENDS).', true);
            }
        }

        if (!friendData) {
            addMessage('ERROR', 'USER NOT FOUND (CHECK EMAIL/NICK).', false, false, true);
            return;
        }

        currentChatPartner = friendData;
        
        state.mode = 'CHAT';
        history.innerHTML = ''; 
        const chatName = friendData.nickname || friendData.email;
        addMessage('SYSTEM', `--- CONNECTION ESTABLISHED: ${chatName} ---`, true);
        addMessage('SYSTEM', `CMDS: 'burn [msg]', 'ascii [url]', 'exit'`, true);
        updatePrompt(currentUser.email);

        const convoId = getConversationId(currentUser.uid, friendData.uid);
        const msgsRef = collection(db, 'artifacts', appId, 'public', 'data', 'messages');
        
        const qMsg = query(msgsRef, where('conversationId', '==', convoId), orderBy('timestamp', 'asc'));

        if (messagesUnsubscribe) messagesUnsubscribe();

        messagesUnsubscribe = onSnapshot(qMsg, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const msg = change.doc.data();
                    let senderName;
                    if (msg.senderId === currentUser.uid) {
                        senderName = 'ME';
                    } else {
                        senderName = friendData.nickname || friendData.email.split('@')[0];
                    }
                    addMessage(senderName, msg.text, false, true, false, msg.isAscii || false, change.doc.id, msg.burn);
                }
                if (change.type === "removed") {
                    const msgId = change.doc.id;
                    const el = msgMap.get(msgId);
                    if (el) {
                        el.style.opacity = '0';
                        setTimeout(() => el.remove(), 500); 
                        msgMap.delete(msgId);
                    }
                }
            });
        }, (error) => {
             if(error.message.includes("index")) {
                 addMessage('ERROR', 'INDEX REQUIRED. Check console.', false, false, true);
                 console.error(error);
             }
        });
    } catch (error) {
        addMessage('ERROR', 'CHAT ERROR: ' + error.message, false, false, true);
    }
}

async function processChatInput(text) {
    const lowText = text.toLowerCase();
    const parts = text.split(' ');
    const cmd = parts[0].toLowerCase();
    
    const radioCommands = ['host', 'host-list', 'kick', 'unkick', 'unhost', 'help', 'clear', 'exit'];
    
    if (radioCommands.includes(cmd)) {
        if (cmd !== 'exit') {
            addMessage('ME', text); 
        }
        await processCommand(text);
        return; 
    }

    if (lowText === 'ascii' || lowText === 'upload') {
        fileInput.click();
        return;
    }

    let isBurn = false;
    let isAscii = false;
    let finalBody = text;
    
    if (lowText.startsWith('burn ')) {
        isBurn = true;
        finalBody = text.substring(5); 
    }

    if (finalBody.toLowerCase().startsWith('ascii ')) {
        addMessage('SYSTEM', 'FETCHING ASCII ART...', true);
        const url = finalBody.substring(6).trim();
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("Network error");
            finalBody = await response.text();
            isAscii = true;
        } catch (e) {
            addMessage('ERROR', 'FAILED TO FETCH ASCII: ' + e.message, false, false, true);
            return;
        }
    }

    finalBody = parseEmojis(finalBody);
    finalBody = finalBody.replace(/\(\?n\)/g, '\n');

    await sendMessage(finalBody, isAscii, isBurn);
}

async function sendMessage(text, isAscii, isBurn) {
    const msgsRef = collection(db, 'artifacts', appId, 'public', 'data', 'messages');
    
    let convoId, receiverId;
    if (state.mode === 'RADIO') {
        convoId = currentChatPartner.id;
        receiverId = 'ALL';
    } else {
        convoId = getConversationId(currentUser.uid, currentChatPartner.uid);
        receiverId = currentChatPartner.uid;
    }

    try {
        const mentionMatches = text.match(/@\((.*?)\)/g);
        if (mentionMatches && mentionMatches.length > 0) {
            mentionMatches.forEach(async (mention) => {
                const targetName = mention.substring(2, mention.length - 1); 
                
                const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'user_profiles');
                const q = query(usersRef, where("displayName", "==", targetName));
                const snap = await getDocs(q);
                
                if (!snap.empty) {
                    const targetUser = snap.docs[0].data();
                    if (targetUser.uid !== currentUser.uid) {
                        const notifRef = collection(db, 'artifacts', appId, 'users', targetUser.uid, 'notifications');
                        await addDoc(notifRef, {
                            type: 'mention',
                            from: currentUser.uid,
                            fromName: currentUser.displayName || currentUser.email,
                            preview: text.substring(0, 50),
                            timestamp: serverTimestamp()
                        });
                    }
                }
            });
        }

        const payload = {
            conversationId: convoId,
            text: text,
            senderId: currentUser.uid,
            senderDisplayName: currentUser.displayName || currentUser.email.split('@')[0],
            receiverId: receiverId,
            burn: isBurn,
            isAscii: isAscii,
            timestamp: serverTimestamp()
        };

        if (state.mode === 'RADIO' && currentChannelAdmins.includes(currentUser.uid)) {
            payload.isHost = true;
        }

        const docRef = await addDoc(msgsRef, payload);

        if (isBurn) {
            setTimeout(async () => {
                try {
                    await deleteDoc(docRef);
                } catch(e) { console.error("Burn failed", e); }
            }, 10000);
        }

    } catch (e) {
        addMessage('ERROR', 'SEND FAILED: ' + e.message, false, false, true);
    }
}

// --- Radio Helper Functions ---

async function resolveUserByNickOrEmail(identifier) {
    const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'user_profiles');
    let q = query(usersRef, where("email", "==", identifier));
    let snapshot = await getDocs(q);
    
    if (!snapshot.empty) return snapshot.docs[0].data();

    q = query(usersRef, where("displayName", "==", identifier));
    snapshot = await getDocs(q);
    if (!snapshot.empty) return snapshot.docs[0].data();

    return null;
}

async function claimRadioHost() {
    if (state.mode !== 'RADIO') {
        addMessage('ERROR', 'YOU MUST BE TUNED INTO A RADIO CHANNEL.', false, false, true);
        return;
    }
    
    const frequency = currentChatPartner.frequency;
    
    try {
        const channelRef = doc(db, 'artifacts', appId, 'public', 'data', 'radio_channels', frequency);
        const channelSnap = await getDoc(channelRef);

        let admins = [];
        if (channelSnap.exists()) {
            admins = channelSnap.data().admins || [];
        }

        if (admins.length > 0) {
            addMessage('ERROR', 'CHANNEL ALREADY HAS A HOST. ASK THEM TO ADD YOU.', false, false, true);
        } else {
            await setDoc(channelRef, {
                admins: [currentUser.uid],
                banned: [],
                createdAt: serverTimestamp(),
                frequency: frequency
            }, { merge: true });
            addMessage('SYSTEM', 'SUCCESS. YOU ARE NOW THE SUPER ADMIN (*).', true);
        }
    } catch (e) {
        addMessage('ERROR', 'CLAIM FAILED: ' + e.message, false, false, true);
    }
}

async function promoteUser(targetName) {
    if (state.mode !== 'RADIO') return;
    
    if (!currentChannelAdmins.includes(currentUser.uid)) {
        addMessage('ERROR', 'PERMISSION DENIED. ADMINS ONLY.', false, false, true);
        return;
    }

    const targetUser = await resolveUserByNickOrEmail(targetName);
    if (!targetUser) {
        addMessage('ERROR', 'USER NOT FOUND.', false, false, true);
        return;
    }

    const channelRef = doc(db, 'artifacts', appId, 'public', 'data', 'radio_channels', currentChatPartner.frequency);
    await updateDoc(channelRef, {
        admins: arrayUnion(targetUser.uid)
    });
    addMessage('SYSTEM', `PROMOTED ${targetName} TO ADMIN.`, true);
}

async function demoteUser(targetName) {
    if (state.mode !== 'RADIO') return;
    
    if (!currentChannelAdmins.includes(currentUser.uid)) {
        addMessage('ERROR', 'PERMISSION DENIED. ADMINS ONLY.', false, false, true);
        return;
    }

    const targetUser = await resolveUserByNickOrEmail(targetName);
    if (!targetUser) {
        addMessage('ERROR', 'USER NOT FOUND.', false, false, true);
        return;
    }

    const channelRef = doc(db, 'artifacts', appId, 'public', 'data', 'radio_channels', currentChatPartner.frequency);
    await updateDoc(channelRef, {
        admins: arrayRemove(targetUser.uid)
    });
    addMessage('SYSTEM', `REMOVED ADMIN STATUS FROM ${targetName}.`, true);
}

async function kickUser(targetName) {
    if (state.mode !== 'RADIO') return;
    
    if (!currentChannelAdmins.includes(currentUser.uid)) {
        addMessage('ERROR', 'PERMISSION DENIED. ADMINS ONLY.', false, false, true);
        return;
    }

    const targetUser = await resolveUserByNickOrEmail(targetName);
    if (!targetUser) {
        addMessage('ERROR', 'USER NOT FOUND.', false, false, true);
        return;
    }

    const channelRef = doc(db, 'artifacts', appId, 'public', 'data', 'radio_channels', currentChatPartner.frequency);
    await updateDoc(channelRef, {
        banned: arrayUnion(targetUser.uid)
    });
    addMessage('SYSTEM', `KICKED AND BANNED ${targetName}.`, true);
}

async function unkickUser(targetName) {
    if (state.mode !== 'RADIO') return;
    
    if (!currentChannelAdmins.includes(currentUser.uid)) {
        addMessage('ERROR', 'PERMISSION DENIED. ADMINS ONLY.', false, false, true);
        return;
    }

    const targetUser = await resolveUserByNickOrEmail(targetName);
    if (!targetUser) {
        addMessage('ERROR', 'USER NOT FOUND.', false, false, true);
        return;
    }

    const channelRef = doc(db, 'artifacts', appId, 'public', 'data', 'radio_channels', currentChatPartner.frequency);
    await updateDoc(channelRef, {
        banned: arrayRemove(targetUser.uid)
    });
    addMessage('SYSTEM', `UNBANNED ${targetName}.`, true);
}

async function showRadioHost() {
    if (state.mode !== 'RADIO') {
        addMessage('ERROR', 'YOU MUST BE TUNED INTO A RADIO CHANNEL.', false, false, true);
        return;
    }

    const frequency = currentChatPartner.frequency;
    addMessage('SYSTEM', `FETCHING ADMINS FOR ${frequency}...`, true);

    try {
        const channelRef = doc(db, 'artifacts', appId, 'public', 'data', 'radio_channels', frequency);
        const channelSnap = await getDoc(channelRef);

        if (!channelSnap.exists() || !channelSnap.data().admins || channelSnap.data().admins.length === 0) {
            addMessage(null, 'NO ADMINS ASSIGNED.');
            return;
        }

        const adminIds = channelSnap.data().admins;
        const bannedIds = channelSnap.data().banned || [];
        
        addMessage(null, `--- CHANNEL ADMINS ---`);
        for (const uid of adminIds) {
            const profileRef = doc(db, 'artifacts', appId, 'public', 'data', 'user_profiles', uid);
            const profileSnap = await getDoc(profileRef);
            let name = "Unknown ID: " + uid;
            if (profileSnap.exists()) {
                name = profileSnap.data().displayName || profileSnap.data().email;
            }
            addMessage(null, `> ${name} (*)${uid === currentUser.uid ? ' [YOU]' : ''}`);
        }

        if (bannedIds.length > 0) {
            addMessage(null, `--- BANNED USERS ---`);
            addMessage(null, `> ${bannedIds.length} user(s) banned.`);
        }

    } catch (e) {
        addMessage('ERROR', 'LOOKUP FAILED: ' + e.message, false, false, true);
    }
}

async function joinRadio(frequency) {
    try {
        currentChatPartner = { 
            type: 'radio', 
            frequency: frequency, 
            id: 'RADIO_' + frequency
        };
        
        state.mode = 'RADIO';
        history.innerHTML = ''; 
        activeRadioParticipants = new Set(); 
        currentChannelAdmins = []; 
        
        addMessage('SYSTEM', `--- TUNED TO FREQUENCY: ${frequency} MHz ---`, true);
        addMessage('SYSTEM', `BROADCASTING OPEN. ANYONE CAN HEAR YOU.`, true);
        updatePrompt(currentUser.email);

        if (channelMetaUnsubscribe) channelMetaUnsubscribe();
        const channelRef = doc(db, 'artifacts', appId, 'public', 'data', 'radio_channels', frequency);
        
        try {
            const channelSnap = await getDoc(channelRef);
            if (channelSnap.exists()) {
                const data = channelSnap.data();
                currentChannelAdmins = data.admins || [];
                
                if (data.banned && data.banned.includes(currentUser.uid)) {
                    if (messagesUnsubscribe) messagesUnsubscribe();
                    if (channelMetaUnsubscribe) channelMetaUnsubscribe();
                    state.mode = 'COMMAND';
                    currentChannelAdmins = [];
                    history.innerHTML = '';
                    addMessage('ERROR', 'CONNECTION TERMINATED. FREQUENCY BLOCKED.', false, false, true);
                    updatePrompt(currentUser.email.split('@')[0]);
                    return;
                }
            } else {
                currentChannelAdmins = [];
            }
        } catch (error) {
            currentChannelAdmins = [];
            console.warn('Could not fetch initial channel metadata:', error.message);
        }
        
        channelMetaUnsubscribe = onSnapshot(channelRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                currentChannelAdmins = data.admins || [];
                
                if (data.banned && data.banned.includes(currentUser.uid)) {
                    if (messagesUnsubscribe) messagesUnsubscribe();
                    if (channelMetaUnsubscribe) channelMetaUnsubscribe();
                    state.mode = 'COMMAND';
                    currentChannelAdmins = [];
                    history.innerHTML = '';
                    addMessage('ERROR', 'CONNECTION TERMINATED. FREQUENCY BLOCKED.', false, false, true);
                    updatePrompt(currentUser.email.split('@')[0]);
                    return;
                }
            } else {
                currentChannelAdmins = [];
            }
        });

        const msgsRef = collection(db, 'artifacts', appId, 'public', 'data', 'messages');
        const qMsg = query(msgsRef, where('conversationId', '==', currentChatPartner.id), orderBy('timestamp', 'asc'));

        if (messagesUnsubscribe) messagesUnsubscribe();

        messagesUnsubscribe = onSnapshot(qMsg, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const msg = change.doc.data();
                    
                    if (msg.senderDisplayName) {
                        activeRadioParticipants.add(msg.senderDisplayName);
                    }

                    let senderName = msg.senderDisplayName || 'UNKNOWN';
                    if (msg.senderId === currentUser.uid) senderName = 'ME';
                    
                    if (msg.isHost) {
                        senderName += ' (*)';
                    }
                    
                    addMessage(senderName, msg.text, false, false, false, msg.isAscii || false, change.doc.id, msg.burn, true);
                }
            });
        }, (error) => {
             if(error.message.includes("index")) {
                 addMessage('ERROR', 'INDEX REQUIRED. Check console.', false, false, true);
                 console.error(error);
             }
        });

    } catch (error) {
        addMessage('ERROR', 'RADIO ERROR: ' + error.message, false, false, true);
    }
}

function getConversationId(uid1, uid2) {
    return [uid1, uid2].sort().join('_');
}