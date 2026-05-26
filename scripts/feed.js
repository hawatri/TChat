// feed.js — global feed of latest posts.

import {
    collection, query, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { db, appId } from './firebase-config.js';
import { state } from './state.js';
import { addMessage, closeAllWindows } from './ui.js';
import { ensureAuth } from './auth.js';
import { renderPostListItem } from './posts.js';

export async function openFeed() {
    if (!ensureAuth()) return;

    state.mode = 'TUI_FEED';
    state.activeWindow = 'feed-window';
    state.menuIndex = 0;

    const feedWindow = document.getElementById('feed-window');
    if (!feedWindow) {
        addMessage('ERROR', 'FEED WINDOW NOT FOUND IN DOM.', false, false, true);
        return;
    }
    feedWindow.style.display = 'flex';

    const feedList = document.getElementById('feed-post-list');
    feedList.innerHTML = '';

    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'profile-post-item';
    loadingDiv.textContent = '[ LOADING FEED... ]';
    loadingDiv.style.textAlign = 'center';
    loadingDiv.style.opacity = '0.5';
    feedList.appendChild(loadingDiv);

    try {
        const postsRef = collection(db, 'artifacts', appId, 'public', 'data', 'posts');
        const q = query(postsRef, orderBy('timestamp', 'desc'), limit(50));
        const snapshot = await getDocs(q);

        feedList.innerHTML = '';

        if (snapshot.empty) {
            const empty = document.createElement('div');
            empty.className = 'profile-post-item';
            empty.textContent = '[ NO POSTS YET ]';
            empty.style.textAlign = 'center';
            empty.style.opacity = '0.5';
            feedList.appendChild(empty);
            return;
        }

        snapshot.forEach((docSnap) => {
            feedList.appendChild(renderPostListItem(docSnap.id, docSnap.data()));
        });

        const firstItem = feedList.querySelector('.profile-post-item[data-post-id]');
        if (firstItem) firstItem.classList.add('selected');
    } catch (error) {
        feedList.innerHTML = '';
        if (error.message.includes('index')) {
            addMessage('ERROR', 'INDEX REQUIRED for posts ordered by timestamp. Check console.', false, false, true);
            console.error(error);
        } else {
            addMessage('ERROR', 'FAILED TO LOAD FEED: ' + error.message, false, false, true);
        }
        closeAllWindows();
    }
}
