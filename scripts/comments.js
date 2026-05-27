// comments.js — read/write helpers for post comments.

import {
    collection, addDoc, query, orderBy, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { db, appId } from './firebase-config.js';
import { state } from './state.js';
import { addMessage } from './ui.js';
import { writeMentionNotifications } from './chat.js';

export async function loadComments(postId) {
    const ref = collection(db, 'artifacts', appId, 'public', 'data', 'posts', postId, 'comments');
    const q = query(ref, orderBy('timestamp', 'asc'));
    const snap = await getDocs(q);
    const out = [];
    snap.forEach(d => out.push({ id: d.id, ...d.data() }));
    return out;
}

export async function addComment(postId, text) {
    if (!state.currentUser || state.currentUser.isAnonymous) {
        addMessage('ERROR', 'LOGIN REQUIRED TO COMMENT.', false, false, true);
        return null;
    }
    const trimmed = text.trim();
    if (!trimmed) {
        addMessage('ERROR', 'COMMENT IS EMPTY.', false, false, true);
        return null;
    }
    try {
        const ref = collection(db, 'artifacts', appId, 'public', 'data', 'posts', postId, 'comments');
        const payload = {
            authorId: state.currentUser.uid,
            authorName: state.currentUser.displayName || state.currentUser.email.split('@')[0],
            authorEmail: state.currentUser.email,
            text: trimmed,
            timestamp: serverTimestamp()
        };
        const docRef = await addDoc(ref, payload);
        // @(name) inside a comment fires the same notification path as chat.
        await writeMentionNotifications(trimmed, 'comment');
        return docRef.id;
    } catch (e) {
        if (e.message.includes('permission') || e.message.includes('Permission')) {
            addMessage('ERROR', 'PERMISSION DENIED. Update FIRESTORE_RULES.md to allow comments subcollection.', false, false, true);
        } else {
            addMessage('ERROR', 'COMMENT FAILED: ' + e.message, false, false, true);
        }
        return null;
    }
}

export function renderComment(c) {
    const div = document.createElement('div');
    div.className = 'post-reader-comment';

    const author = document.createElement('span');
    author.className = 'post-reader-comment-author';
    author.textContent = `[${c.authorName || c.authorEmail || 'anon'}]:`;
    div.appendChild(author);

    const body = document.createElement('span');
    // Preserve mention highlight by escaping then replacing.
    let html = (c.text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/@\((.*?)\)/g, '<span class="highlight-mention">@($1)</span>');
    body.innerHTML = ' ' + html;
    div.appendChild(body);

    if (c.timestamp && c.timestamp.seconds) {
        const time = document.createElement('span');
        time.className = 'post-reader-comment-time';
        time.textContent = new Date(c.timestamp.seconds * 1000).toLocaleString();
        div.appendChild(time);
    }
    return div;
}
