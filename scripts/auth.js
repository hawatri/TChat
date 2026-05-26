// auth.js — authentication, status updates, notification listener.

import {
    signInWithPopup, GoogleAuthProvider, onAuthStateChanged,
    signInAnonymously, signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    collection, doc, setDoc, getDoc, query, orderBy, limit, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { auth, db, appId } from './firebase-config.js';
import { state } from './state.js';
import { addMessage, updatePrompt, triggerNotificationEffect } from './ui.js';

export function ensureAuth() {
    if (!state.currentUser || state.currentUser.isAnonymous) {
        addMessage('ERROR', 'ACCESS DENIED. LOGIN REQUIRED.', false, false, true);
        return false;
    }
    return true;
}

export async function initGuestAuth() {
    try { await signInAnonymously(auth); }
    catch (e) { console.warn("Guest login failed:", e.code); }
}

export async function updateStatus(status) {
    if (!state.currentUser || state.currentUser.isAnonymous) return false;
    try {
        const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'user_profiles', state.currentUser.uid);
        await setDoc(userRef, {
            status: status,
            lastSeen: serverTimestamp()
        }, { merge: true });
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}

export function setupNotificationListener(uid) {
    if (state.notificationUnsubscribe) state.notificationUnsubscribe();

    const notifRef = collection(db, 'artifacts', appId, 'users', uid, 'notifications');
    const q = query(notifRef, orderBy('timestamp', 'desc'), limit(1));

    state.notificationUnsubscribe = onSnapshot(q, (snapshot) => {
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

export async function handleLogin() {
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
}

export async function handleLogout() {
    if (state.currentUser && !state.currentUser.isAnonymous) {
        try {
            await signOut(auth);
            addMessage('SYSTEM', 'LOGGED OUT. REVERTING TO GUEST MODE...', true);
        } catch (e) {
            addMessage('ERROR', 'LOGOUT FAILED: ' + e.message, false, false, true);
        }
    } else {
        addMessage('SYSTEM', 'ALREADY IN GUEST MODE.', true);
    }
}

export function setupAuthStateListener() {
    onAuthStateChanged(auth, async (user) => {
        state.currentUser = user;
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
                } catch (e) { /* non-fatal */ }
            }
        } else {
            updatePrompt('offline');
            initGuestAuth();
            if (state.notificationUnsubscribe) state.notificationUnsubscribe();
        }
    });
}
