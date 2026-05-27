// feed.js — global feed of latest posts. Supports modes: 'recent' | 'top' | 'search'.

import {
    collection, query, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { db, appId } from './firebase-config.js';
import { state } from './state.js';
import { addMessage, closeAllWindows } from './ui.js';
import { ensureAuth } from './auth.js';
import { renderPostListItem } from './posts.js';

const MODE_TITLE = {
    recent: ':: T-OS GLOBAL FEED ::',
    top:    ':: T-OS TOP POSTS ::',
    search: ':: T-OS SEARCH RESULTS ::'
};

export async function openFeed(opts = {}) {
    if (!ensureAuth()) return;
    const mode = opts.mode || 'recent';
    const q = (opts.query || '').toLowerCase().trim();

    state.mode = 'TUI_FEED';
    state.activeWindow = 'feed-window';
    state.menuIndex = 0;

    const feedWindow = document.getElementById('feed-window');
    if (!feedWindow) {
        addMessage('ERROR', 'FEED WINDOW NOT FOUND IN DOM.', false, false, true);
        return;
    }
    feedWindow.style.display = 'flex';

    const headerEl = feedWindow.querySelector('.editor-header');
    if (headerEl) headerEl.textContent = MODE_TITLE[mode] || MODE_TITLE.recent;

    const sectionHeader = feedWindow.querySelector('.profile-viewer-posts-header');
    if (sectionHeader) {
        sectionHeader.textContent = mode === 'top' ? 'TOP POSTS BY LIKES:'
            : mode === 'search' ? `RESULTS FOR "${q}":`
            : 'LATEST POSTS:';
    }

    const feedList = document.getElementById('feed-post-list');
    feedList.innerHTML = '';

    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'profile-post-item';
    loadingDiv.textContent = '[ LOADING... ]';
    loadingDiv.style.textAlign = 'center';
    loadingDiv.style.opacity = '0.5';
    feedList.appendChild(loadingDiv);

    try {
        const postsRef = collection(db, 'artifacts', appId, 'public', 'data', 'posts');
        let firestoreQuery;
        if (mode === 'top') {
            firestoreQuery = query(postsRef, orderBy('likes', 'desc'), limit(50));
        } else if (mode === 'search') {
            // Pull a wider page and filter client-side. Firestore has no LIKE/contains.
            firestoreQuery = query(postsRef, orderBy('timestamp', 'desc'), limit(100));
        } else {
            firestoreQuery = query(postsRef, orderBy('timestamp', 'desc'), limit(50));
        }
        const snapshot = await getDocs(firestoreQuery);

        feedList.innerHTML = '';

        let docs = snapshot.docs;
        if (mode === 'search' && q) {
            docs = docs.filter(d => {
                const data = d.data();
                const title = (data.title || '').toLowerCase();
                const body = (data.body || '').toLowerCase();
                return title.includes(q) || body.includes(q);
            });
        }

        if (docs.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'profile-post-item';
            empty.textContent = mode === 'search' ? '[ NO MATCHES ]' : '[ NO POSTS YET ]';
            empty.style.textAlign = 'center';
            empty.style.opacity = '0.5';
            feedList.appendChild(empty);
            return;
        }

        docs.forEach((docSnap) => {
            feedList.appendChild(renderPostListItem(docSnap.id, docSnap.data()));
        });

        const firstItem = feedList.querySelector('.profile-post-item[data-post-id]');
        if (firstItem) firstItem.classList.add('selected');
    } catch (error) {
        feedList.innerHTML = '';
        if (error.message.includes('index')) {
            addMessage('ERROR', 'INDEX REQUIRED for posts. Check console.', false, false, true);
            console.error(error);
        } else {
            addMessage('ERROR', 'FAILED TO LOAD FEED: ' + error.message, false, false, true);
        }
        closeAllWindows();
    }
}
