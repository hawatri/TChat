// radio.js — broadcast frequency rooms with admin/ban controls.

import {
    collection, doc, query, where, orderBy, onSnapshot,
    getDoc, getDocs, setDoc, updateDoc, arrayUnion, arrayRemove,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { db, appId } from './firebase-config.js';
import { state } from './state.js';
import { addMessage, updatePrompt, history } from './ui.js';

export async function resolveUserByNickOrEmail(identifier) {
    const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'user_profiles');
    let q = query(usersRef, where("email", "==", identifier));
    let snapshot = await getDocs(q);
    if (!snapshot.empty) return snapshot.docs[0].data();

    q = query(usersRef, where("displayName", "==", identifier));
    snapshot = await getDocs(q);
    if (!snapshot.empty) return snapshot.docs[0].data();

    return null;
}

export async function claimRadioHost() {
    if (state.mode !== 'RADIO') {
        addMessage('ERROR', 'YOU MUST BE TUNED INTO A RADIO CHANNEL.', false, false, true);
        return;
    }
    const frequency = state.currentChatPartner.frequency;

    try {
        const channelRef = doc(db, 'artifacts', appId, 'public', 'data', 'radio_channels', frequency);
        const channelSnap = await getDoc(channelRef);

        let admins = [];
        if (channelSnap.exists()) admins = channelSnap.data().admins || [];

        if (admins.length > 0) {
            addMessage('ERROR', 'CHANNEL ALREADY HAS A HOST. ASK THEM TO ADD YOU.', false, false, true);
        } else {
            await setDoc(channelRef, {
                admins: [state.currentUser.uid],
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

export async function promoteUser(targetName) {
    if (state.mode !== 'RADIO') return;
    if (!state.currentChannelAdmins.includes(state.currentUser.uid)) {
        addMessage('ERROR', 'PERMISSION DENIED. ADMINS ONLY.', false, false, true);
        return;
    }
    const targetUser = await resolveUserByNickOrEmail(targetName);
    if (!targetUser) { addMessage('ERROR', 'USER NOT FOUND.', false, false, true); return; }

    const channelRef = doc(db, 'artifacts', appId, 'public', 'data', 'radio_channels', state.currentChatPartner.frequency);
    await updateDoc(channelRef, { admins: arrayUnion(targetUser.uid) });
    addMessage('SYSTEM', `PROMOTED ${targetName} TO ADMIN.`, true);
}

export async function demoteUser(targetName) {
    if (state.mode !== 'RADIO') return;
    if (!state.currentChannelAdmins.includes(state.currentUser.uid)) {
        addMessage('ERROR', 'PERMISSION DENIED. ADMINS ONLY.', false, false, true);
        return;
    }
    const targetUser = await resolveUserByNickOrEmail(targetName);
    if (!targetUser) { addMessage('ERROR', 'USER NOT FOUND.', false, false, true); return; }

    const channelRef = doc(db, 'artifacts', appId, 'public', 'data', 'radio_channels', state.currentChatPartner.frequency);
    await updateDoc(channelRef, { admins: arrayRemove(targetUser.uid) });
    addMessage('SYSTEM', `REMOVED ADMIN STATUS FROM ${targetName}.`, true);
}

export async function kickUser(targetName) {
    if (state.mode !== 'RADIO') return;
    if (!state.currentChannelAdmins.includes(state.currentUser.uid)) {
        addMessage('ERROR', 'PERMISSION DENIED. ADMINS ONLY.', false, false, true);
        return;
    }
    const targetUser = await resolveUserByNickOrEmail(targetName);
    if (!targetUser) { addMessage('ERROR', 'USER NOT FOUND.', false, false, true); return; }

    const channelRef = doc(db, 'artifacts', appId, 'public', 'data', 'radio_channels', state.currentChatPartner.frequency);
    await updateDoc(channelRef, { banned: arrayUnion(targetUser.uid) });
    addMessage('SYSTEM', `KICKED AND BANNED ${targetName}.`, true);
}

export async function unkickUser(targetName) {
    if (state.mode !== 'RADIO') return;
    if (!state.currentChannelAdmins.includes(state.currentUser.uid)) {
        addMessage('ERROR', 'PERMISSION DENIED. ADMINS ONLY.', false, false, true);
        return;
    }
    const targetUser = await resolveUserByNickOrEmail(targetName);
    if (!targetUser) { addMessage('ERROR', 'USER NOT FOUND.', false, false, true); return; }

    const channelRef = doc(db, 'artifacts', appId, 'public', 'data', 'radio_channels', state.currentChatPartner.frequency);
    await updateDoc(channelRef, { banned: arrayRemove(targetUser.uid) });
    addMessage('SYSTEM', `UNBANNED ${targetName}.`, true);
}

export async function showRadioHost() {
    if (state.mode !== 'RADIO') {
        addMessage('ERROR', 'YOU MUST BE TUNED INTO A RADIO CHANNEL.', false, false, true);
        return;
    }
    const frequency = state.currentChatPartner.frequency;
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
            if (profileSnap.exists()) name = profileSnap.data().displayName || profileSnap.data().email;
            addMessage(null, `> ${name} (*)${uid === state.currentUser.uid ? ' [YOU]' : ''}`);
        }

        if (bannedIds.length > 0) {
            addMessage(null, `--- BANNED USERS ---`);
            addMessage(null, `> ${bannedIds.length} user(s) banned.`);
        }
    } catch (e) {
        addMessage('ERROR', 'LOOKUP FAILED: ' + e.message, false, false, true);
    }
}

export async function joinRadio(frequency) {
    try {
        state.currentChatPartner = {
            type: 'radio',
            frequency: frequency,
            id: 'RADIO_' + frequency
        };
        state.mode = 'RADIO';
        history.innerHTML = '';
        state.activeRadioParticipants = new Set();
        state.currentChannelAdmins = [];

        addMessage('SYSTEM', `--- TUNED TO FREQUENCY: ${frequency} MHz ---`, true);
        addMessage('SYSTEM', `BROADCASTING OPEN. ANYONE CAN HEAR YOU.`, true);
        updatePrompt(state.currentUser.email);

        if (state.channelMetaUnsubscribe) state.channelMetaUnsubscribe();
        const channelRef = doc(db, 'artifacts', appId, 'public', 'data', 'radio_channels', frequency);

        try {
            const channelSnap = await getDoc(channelRef);
            if (channelSnap.exists()) {
                const data = channelSnap.data();
                state.currentChannelAdmins = data.admins || [];
                if (data.banned && data.banned.includes(state.currentUser.uid)) {
                    if (state.messagesUnsubscribe) state.messagesUnsubscribe();
                    if (state.channelMetaUnsubscribe) state.channelMetaUnsubscribe();
                    state.mode = 'COMMAND';
                    state.currentChannelAdmins = [];
                    history.innerHTML = '';
                    addMessage('ERROR', 'CONNECTION TERMINATED. FREQUENCY BLOCKED.', false, false, true);
                    updatePrompt(state.currentUser.email.split('@')[0]);
                    return;
                }
            } else {
                state.currentChannelAdmins = [];
            }
        } catch (error) {
            state.currentChannelAdmins = [];
            console.warn('Could not fetch initial channel metadata:', error.message);
        }

        state.channelMetaUnsubscribe = onSnapshot(channelRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                state.currentChannelAdmins = data.admins || [];
                if (data.banned && data.banned.includes(state.currentUser.uid)) {
                    if (state.messagesUnsubscribe) state.messagesUnsubscribe();
                    if (state.channelMetaUnsubscribe) state.channelMetaUnsubscribe();
                    state.mode = 'COMMAND';
                    state.currentChannelAdmins = [];
                    history.innerHTML = '';
                    addMessage('ERROR', 'CONNECTION TERMINATED. FREQUENCY BLOCKED.', false, false, true);
                    updatePrompt(state.currentUser.email.split('@')[0]);
                }
            } else {
                state.currentChannelAdmins = [];
            }
        });

        const msgsRef = collection(db, 'artifacts', appId, 'public', 'data', 'messages');
        const qMsg = query(msgsRef, where('conversationId', '==', state.currentChatPartner.id), orderBy('timestamp', 'asc'));

        if (state.messagesUnsubscribe) state.messagesUnsubscribe();

        state.messagesUnsubscribe = onSnapshot(qMsg, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const msg = change.doc.data();
                    if (msg.senderDisplayName) state.activeRadioParticipants.add(msg.senderDisplayName);

                    let senderName = msg.senderDisplayName || 'UNKNOWN';
                    if (msg.senderId === state.currentUser.uid) senderName = 'ME';
                    if (msg.isHost) senderName += ' (*)';

                    addMessage(senderName, msg.text, false, false, false, msg.isAscii || false, change.doc.id, msg.burn, true);
                }
            });
        }, (error) => {
            if (error.message.includes("index")) {
                addMessage('ERROR', 'INDEX REQUIRED. Check console.', false, false, true);
                console.error(error);
            }
        });
    } catch (error) {
        addMessage('ERROR', 'RADIO ERROR: ' + error.message, false, false, true);
    }
}
