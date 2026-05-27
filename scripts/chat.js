// chat.js — 1:1 conversations and chat-mode input parser.

import {
    collection, addDoc, doc, deleteDoc, query, where, orderBy,
    onSnapshot, serverTimestamp, getDocs
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { db, appId } from './firebase-config.js';
import { state } from './state.js';
import { addMessage, updatePrompt, history, fileInput } from './ui.js';
import { parseEmojis, getConversationId } from './utils.js';

// processCommand is imported lazily to avoid a circular import with commands.js.
let _processCommand = null;
export function registerCommandProcessor(fn) { _processCommand = fn; }

// Mention parsing → notification writes. Reused by chat messages and comments.
export async function writeMentionNotifications(text, contextLabel = '') {
    const matches = text.match(/@\((.*?)\)/g);
    if (!matches || matches.length === 0) return;

    for (const mention of matches) {
        const targetName = mention.substring(2, mention.length - 1);
        try {
            const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'user_profiles');
            const q = query(usersRef, where("displayName", "==", targetName));
            const snap = await getDocs(q);
            if (snap.empty) continue;

            const targetUser = snap.docs[0].data();
            if (targetUser.uid === state.currentUser.uid) continue;

            const notifRef = collection(db, 'artifacts', appId, 'users', targetUser.uid, 'notifications');
            await addDoc(notifRef, {
                type: 'mention',
                from: state.currentUser.uid,
                fromName: state.currentUser.displayName || state.currentUser.email,
                preview: (contextLabel ? `[${contextLabel}] ` : '') + text.substring(0, 50),
                timestamp: serverTimestamp()
            });
        } catch (e) {
            console.warn('mention notification failed', e);
        }
    }
}

export async function startChat(identifier) {
    try {
        let friendData = null;

        const friendsRef = collection(db, 'artifacts', appId, 'users', state.currentUser.uid, 'friends');
        let q = query(friendsRef, where("nickname", "==", identifier));
        let snapshot = await getDocs(q);

        if (!snapshot.empty) {
            friendData = snapshot.docs[0].data();
        } else {
            q = query(friendsRef, where("email", "==", identifier));
            snapshot = await getDocs(q);
            if (!snapshot.empty) friendData = snapshot.docs[0].data();
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

        state.currentChatPartner = friendData;
        state.mode = 'CHAT';
        history.innerHTML = '';

        const chatName = friendData.nickname || friendData.email;
        addMessage('SYSTEM', `--- CONNECTION ESTABLISHED: ${chatName} ---`, true);
        addMessage('SYSTEM', `CMDS: 'burn [msg]', 'ascii [url]', 'exit'`, true);
        updatePrompt(state.currentUser.email);

        const convoId = getConversationId(state.currentUser.uid, friendData.uid);
        const msgsRef = collection(db, 'artifacts', appId, 'public', 'data', 'messages');
        const qMsg = query(msgsRef, where('conversationId', '==', convoId), orderBy('timestamp', 'asc'));

        if (state.messagesUnsubscribe) state.messagesUnsubscribe();

        state.messagesUnsubscribe = onSnapshot(qMsg, (snap) => {
            snap.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const msg = change.doc.data();
                    // Drop messages from blocked users (client-side filter).
                    if (msg.senderId !== state.currentUser.uid && state.blocked && state.blocked.has(msg.senderId)) {
                        return;
                    }
                    let senderName = (msg.senderId === state.currentUser.uid)
                        ? 'ME'
                        : (friendData.nickname || friendData.email.split('@')[0]);
                    addMessage(senderName, msg.text, false, true, false, msg.isAscii || false, change.doc.id, msg.burn);
                }
                if (change.type === "removed") {
                    const msgId = change.doc.id;
                    const el = state.msgMap.get(msgId);
                    if (el) {
                        el.style.opacity = '0';
                        setTimeout(() => el.remove(), 500);
                        state.msgMap.delete(msgId);
                    }
                }
            });
        }, (error) => {
            if (error.message.includes("index")) {
                addMessage('ERROR', 'INDEX REQUIRED. Check console.', false, false, true);
                console.error(error);
            }
        });
    } catch (error) {
        addMessage('ERROR', 'CHAT ERROR: ' + error.message, false, false, true);
    }
}

export async function processChatInput(text) {
    const lowText = text.toLowerCase();
    const parts = text.split(' ');
    const cmd = parts[0].toLowerCase();

    const radioCommands = ['host', 'host-list', 'kick', 'unkick', 'unhost', 'help', 'clear', 'exit'];
    if (radioCommands.includes(cmd)) {
        if (cmd !== 'exit') addMessage('ME', text);
        if (_processCommand) await _processCommand(text);
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

export async function sendMessage(text, isAscii, isBurn) {
    if (!state.currentUser || !state.currentUser.uid) {
        addMessage('ERROR', 'NOT AUTHENTICATED. PLEASE LOGIN.', false, false, true);
        return;
    }

    const msgsRef = collection(db, 'artifacts', appId, 'public', 'data', 'messages');

    let convoId, receiverId;
    if (state.mode === 'RADIO') {
        convoId = state.currentChatPartner.id;
        receiverId = 'ALL';
    } else {
        if (!state.currentChatPartner || !state.currentChatPartner.uid) {
            addMessage('ERROR', 'NO CHAT PARTNER SELECTED.', false, false, true);
            return;
        }
        convoId = getConversationId(state.currentUser.uid, state.currentChatPartner.uid);
        receiverId = state.currentChatPartner.uid;
    }

    try {
        // Mention parsing → notification writes (shared helper).
        await writeMentionNotifications(text);

        const payload = {
            conversationId: convoId,
            text: text,
            senderId: state.currentUser.uid,
            senderDisplayName: state.currentUser.displayName || state.currentUser.email.split('@')[0],
            receiverId: receiverId,
            burn: isBurn,
            isAscii: isAscii,
            timestamp: serverTimestamp()
        };
        if (state.mode === 'RADIO' && state.currentChannelAdmins.includes(state.currentUser.uid)) {
            payload.isHost = true;
        }

        const docRef = await addDoc(msgsRef, payload);

        if (isBurn) {
            setTimeout(async () => {
                try { await deleteDoc(docRef); }
                catch (e) { console.error("Burn failed", e); }
            }, 10000);
        }
    } catch (e) {
        addMessage('ERROR', 'SEND FAILED: ' + e.message, false, false, true);
    }
}
