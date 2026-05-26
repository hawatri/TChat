// social.js — friends, mentions, whois, ping, neofetch, reqbox.

import {
    collection, doc, query, where, getDocs, getDoc, setDoc,
    serverTimestamp, limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { db, appId } from './firebase-config.js';
import { state } from './state.js';
import { addMessage, scrollToBottom, history } from './ui.js';
import { ensureAuth } from './auth.js';

export async function showRecentMentions() {
    if (!ensureAuth()) return;
    addMessage('SYSTEM', 'FETCHING RECENT MENTIONS...', true);

    try {
        const notifRef = collection(db, 'artifacts', appId, 'users', state.currentUser.uid, 'notifications');
        const q = query(notifRef, limit(10));
        const snap = await getDocs(q);

        if (snap.empty) {
            addMessage(null, 'NO RECENT MENTIONS FOUND.');
            return;
        }

        const notifs = [];
        snap.forEach(d => notifs.push(d.data()));
        notifs.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        notifs.forEach(data => {
            const time = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleTimeString() : '??:??';
            addMessage(null, `[${time}] ${data.fromName}: ${data.preview}`);
        });
    } catch (e) {
        addMessage('ERROR', 'FAILED: ' + e.message, false, false, true);
    }
}

export async function runWhois(identifier) {
    addMessage('SYSTEM', `QUERYING DIRECTORY FOR: ${identifier}...`, true);

    try {
        const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'user_profiles');
        const q = query(usersRef, where("email", "==", identifier));
        const snapshot = await getDocs(q);

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
    } catch (e) {
        addMessage('ERROR', 'WHOIS FAILED: ' + e.message, false, false, true);
    }
}

export function runNeofetch() {
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

    const u = state.currentUser;
    const user = u ? (u.displayName || u.email.split('@')[0]) : 'guest';
    const authStatus = u && !u.isAnonymous ? 'Authenticated' : 'Anonymous';
    const email = u && !u.isAnonymous ? u.email : 'N/A';

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
    for (let i = 0; i < maxLines; i++) {
        const logoLine = (logo[i] || "").padEnd(logoWidth, " ");
        const infoLine = info[i] || "";
        output += `${logoLine}  ${infoLine}\n`;
    }
    output += "\n   [31m███[32m███[33m███[34m███[35m███[36m███";

    addMessage(null, output, false, false, false, true);
}

export async function pingUser(targetEmail) {
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

export async function addFriend(targetEmail) {
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
        const myFriendsRef = doc(db, 'artifacts', appId, 'users', state.currentUser.uid, 'friends', targetUser.uid);
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

export async function setNickname(targetEmail, nickname) {
    addMessage('SYSTEM', `SETTING NICKNAME...`, true);
    try {
        const friendsRef = collection(db, 'artifacts', appId, 'users', state.currentUser.uid, 'friends');
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

export async function listFriends() {
    addMessage('SYSTEM', 'FETCHING FRIEND LIST...', true);
    try {
        const friendsRef = collection(db, 'artifacts', appId, 'users', state.currentUser.uid, 'friends');
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
            if (profileSnap.exists()) status = profileSnap.data().status || 'offline';
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

export async function listFriendsEmails() {
    addMessage('SYSTEM', 'FETCHING CONTACTS...', true);
    try {
        const friendsRef = collection(db, 'artifacts', appId, 'users', state.currentUser.uid, 'friends');
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

export async function checkReqBox() {
    addMessage('SYSTEM', 'SCANNING FREQUENCIES (REQBOX)...', true);
    try {
        const friendsRef = collection(db, 'artifacts', appId, 'users', state.currentUser.uid, 'friends');
        const friendsSnap = await getDocs(friendsRef);
        const friendMap = new Map();
        friendsSnap.forEach(d => {
            const data = d.data();
            friendMap.set(data.uid, data);
        });

        const msgsRef = collection(db, 'artifacts', appId, 'public', 'data', 'messages');
        const q = query(msgsRef, where('receiverId', '==', state.currentUser.uid));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            addMessage(null, 'NO MESSAGES FOUND.');
            return;
        }

        const senders = new Set();
        snapshot.forEach(d => senders.add(d.data().senderId));

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
                    addMessage(null, `> [NEW]    UNKNOWN_USER [${uid.slice(0, 5)}..]`);
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
