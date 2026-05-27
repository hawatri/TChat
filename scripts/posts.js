// posts.js — post writer, profile viewer (with post list), post reader, likes.

import {
    collection, addDoc, doc, getDoc, getDocs, query, where, orderBy,
    limit, serverTimestamp, updateDoc, arrayUnion, arrayRemove, deleteDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { db, appId } from './firebase-config.js';
import { state } from './state.js';
import { addMessage, fileInput, closeAllWindows } from './ui.js';
import { ensureAuth } from './auth.js';
import { loadComments, addComment, renderComment } from './comments.js';

// --- Post Writer ---
export function openPostWriter() {
    if (!ensureAuth()) return;
    state.mode = 'TUI_POST_WRITE';
    state.activeWindow = 'post-writer-window';

    const postWindow = document.getElementById('post-writer-window');
    postWindow.style.display = 'flex';

    document.getElementById('post-title').value = '';
    document.getElementById('post-body').value = '';
    const previewDiv = document.getElementById('post-ascii-preview');
    previewDiv.textContent = '[ CLICK TO UPLOAD IMAGE ]';
    previewDiv.classList.remove('ascii-art');
    state.currentPostAscii = null;
    document.getElementById('post-char-count').textContent = '0';

    document.getElementById('post-title').focus();

    previewDiv.onclick = () => {
        if (state.mode === 'TUI_POST_WRITE') fileInput.click();
    };

    const bodyTextarea = document.getElementById('post-body');
    bodyTextarea.oninput = () => {
        document.getElementById('post-char-count').textContent = bodyTextarea.value.length;
    };

    const titleInput = document.getElementById('post-title');
    titleInput.onkeydown = (e) => {
        if (e.key === 'Tab') { e.preventDefault(); bodyTextarea.focus(); }
    };
    bodyTextarea.onkeydown = (e) => {
        if (e.key === 'Tab') { e.preventDefault(); titleInput.focus(); }
        else if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); publishPost(); }
    };

    const publishBtn = document.getElementById('post-publish-btn');
    const cancelBtn = document.getElementById('post-cancel-btn');
    if (publishBtn) publishBtn.onclick = () => publishPost();
    if (cancelBtn) cancelBtn.onclick = () => closeAllWindows();
}

export async function publishPost() {
    if (state.isPublishing) return;
    if (!ensureAuth()) return;
    if (!state.currentUser || !state.currentUser.uid) {
        addMessage('ERROR', 'NOT AUTHENTICATED. PLEASE LOGIN.', false, false, true);
        return;
    }

    const title = document.getElementById('post-title').value.trim();
    const body = document.getElementById('post-body').value.trim();

    if (!title) { addMessage('ERROR', 'TITLE IS REQUIRED.', false, false, true); return; }
    if (!body) { addMessage('ERROR', 'BODY IS REQUIRED.', false, false, true); return; }

    state.isPublishing = true;
    const publishBtn = document.getElementById('post-publish-btn');
    if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.textContent = '[ PUBLISHING... ]';
    }

    try {
        const postsRef = collection(db, 'artifacts', appId, 'public', 'data', 'posts');
        const postData = {
            authorId: state.currentUser.uid,
            authorName: state.currentUser.displayName || state.currentUser.email.split('@')[0],
            authorEmail: state.currentUser.email,
            title: title,
            body: body,
            asciiArt: state.currentPostAscii || null,
            timestamp: serverTimestamp(),
            likes: 0,
            likedBy: []
        };
        await addDoc(postsRef, postData);

        addMessage('SYSTEM', 'POST PUBLISHED SUCCESSFULLY.', true);
        closeAllWindows();
    } catch (error) {
        state.isPublishing = false;
        if (publishBtn) {
            publishBtn.disabled = false;
            publishBtn.textContent = '[ PUBLISH ]';
        }
        if (error.message.includes('permission') || error.message.includes('Permission')) {
            addMessage('ERROR', 'PERMISSION DENIED. Check Firestore security rules for "posts" collection. See FIRESTORE_RULES.md', false, false, true);
        } else {
            addMessage('ERROR', 'FAILED TO PUBLISH POST: ' + error.message, false, false, true);
        }
    }
}

// --- Profile Viewer ---
export async function openProfileViewer(email) {
    if (!ensureAuth()) return;
    if (!state.currentUser || !state.currentUser.uid) {
        addMessage('ERROR', 'NOT AUTHENTICATED. PLEASE LOGIN.', false, false, true);
        return;
    }

    state.mode = 'TUI_PROFILE';
    state.activeWindow = 'profile-viewer-window';
    state.menuIndex = 0;

    const profileWindow = document.getElementById('profile-viewer-window');
    profileWindow.style.display = 'flex';

    document.getElementById('profile-viewer-nickname').textContent = '';
    document.getElementById('profile-viewer-email').textContent = '';
    document.getElementById('profile-viewer-bio').textContent = '';
    document.getElementById('profile-viewer-avatar').textContent = '';
    document.getElementById('profile-viewer-avatar').classList.remove('ascii-art');
    document.getElementById('profile-post-list').innerHTML = '';

    try {
        const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'user_profiles');
        const q = query(usersRef, where("email", "==", email));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            addMessage('ERROR', 'USER NOT FOUND.', false, false, true);
            closeAllWindows();
            return;
        }

        const userData = snapshot.docs[0].data();

        document.getElementById('profile-viewer-nickname').textContent = userData.displayName || email.split('@')[0];
        document.getElementById('profile-viewer-email').textContent = email;
        document.getElementById('profile-viewer-bio').textContent = userData.bio || '[ NO BIO ]';

        if (userData.avatarAscii) {
            const avatarDiv = document.getElementById('profile-viewer-avatar');
            avatarDiv.textContent = userData.avatarAscii;
            avatarDiv.classList.add('ascii-art');
        } else {
            document.getElementById('profile-viewer-avatar').textContent = '[ NO AVATAR ]';
        }

        const postsRef = collection(db, 'artifacts', appId, 'public', 'data', 'posts');
        const postsQuery = query(
            postsRef,
            where('authorEmail', '==', email),
            orderBy('timestamp', 'desc'),
            limit(20)
        );
        const postsSnapshot = await getDocs(postsQuery);
        const postList = document.getElementById('profile-post-list');

        if (postsSnapshot.empty) {
            const noPostsDiv = document.createElement('div');
            noPostsDiv.className = 'profile-post-item';
            noPostsDiv.textContent = '[ NO POSTS YET ]';
            noPostsDiv.style.textAlign = 'center';
            noPostsDiv.style.opacity = '0.5';
            postList.appendChild(noPostsDiv);
        } else {
            postsSnapshot.forEach((docSnap) => {
                postList.appendChild(renderPostListItem(docSnap.id, docSnap.data()));
            });
            const firstItem = postList.querySelector('.profile-post-item[data-post-id]');
            if (firstItem) firstItem.classList.add('selected');
        }
    } catch (error) {
        addMessage('ERROR', 'FAILED TO LOAD PROFILE: ' + error.message, false, false, true);
        closeAllWindows();
    }
}

// Shared post-list-item renderer (used by profile viewer + feed).
export function renderPostListItem(postId, postData) {
    const postItem = document.createElement('div');
    postItem.className = 'profile-post-item';
    postItem.setAttribute('data-post-id', postId);

    const titleDiv = document.createElement('div');
    titleDiv.className = 'profile-post-item-title';
    titleDiv.textContent = postData.title || '[ NO TITLE ]';

    const previewDiv = document.createElement('div');
    previewDiv.className = 'profile-post-item-preview';
    const bodyPreview = postData.body ? postData.body.substring(0, 80) : '';
    previewDiv.textContent = bodyPreview + (bodyPreview.length >= 80 ? '...' : '');

    const metaDiv = document.createElement('div');
    metaDiv.className = 'profile-post-item-meta';
    const timestamp = postData.timestamp ? new Date(postData.timestamp.seconds * 1000).toLocaleString() : 'Unknown';
    const author = postData.authorName || postData.authorEmail || 'Unknown';
    metaDiv.textContent = `${author} | Likes: ${postData.likes || 0} | ${timestamp}`;

    postItem.appendChild(titleDiv);
    postItem.appendChild(previewDiv);
    postItem.appendChild(metaDiv);
    return postItem;
}

// --- Post Reader ---
export async function openPostReader(postId) {
    if (!ensureAuth()) return;

    state.mode = 'TUI_POST_READ';
    state.activeWindow = 'post-reader-window';
    state.currentPostId = postId;

    const postReaderWindow = document.getElementById('post-reader-window');
    postReaderWindow.style.display = 'flex';

    document.getElementById('profile-viewer-window').style.display = 'none';
    const feedWindow = document.getElementById('feed-window');
    if (feedWindow) feedWindow.style.display = 'none';

    document.getElementById('post-reader-title').textContent = '';
    document.getElementById('post-reader-author').textContent = '';
    document.getElementById('post-reader-date').textContent = '';
    document.getElementById('post-reader-content').innerHTML = '';

    try {
        const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'posts', postId);
        const postSnap = await getDoc(postRef);

        if (!postSnap.exists()) {
            addMessage('ERROR', 'POST NOT FOUND.', false, false, true);
            postReaderWindow.style.display = 'none';
            state.mode = 'TUI_PROFILE';
            document.getElementById('profile-viewer-window').style.display = 'flex';
            return;
        }

        const postData = postSnap.data();

        document.getElementById('post-reader-title').textContent = postData.title || '[ NO TITLE ]';
        document.getElementById('post-reader-author').textContent = `AUTHOR: ${postData.authorName || postData.authorEmail || 'Unknown'}`;
        const timestamp = postData.timestamp ? new Date(postData.timestamp.seconds * 1000).toLocaleString() : 'Unknown';
        document.getElementById('post-reader-date').textContent = `DATE: ${timestamp}`;

        const contentDiv = document.getElementById('post-reader-content');

        // Likes status line — always visible at the top of content
        renderLikesLine(contentDiv, postData);

        if (postData.asciiArt) {
            const asciiDiv = document.createElement('div');
            asciiDiv.className = 'post-reader-ascii ascii-art';
            asciiDiv.textContent = postData.asciiArt;
            contentDiv.appendChild(asciiDiv);
        }

        if (postData.body) {
            const bodyDiv = document.createElement('div');
            bodyDiv.className = 'post-reader-body';
            bodyDiv.textContent = postData.body;
            contentDiv.appendChild(bodyDiv);
        } else {
            const noBodyDiv = document.createElement('div');
            noBodyDiv.className = 'post-reader-body';
            noBodyDiv.textContent = '[ NO CONTENT ]';
            noBodyDiv.style.opacity = '0.5';
            contentDiv.appendChild(noBodyDiv);
        }

        // Show [D] Delete affordance in the reader footer if user is the author.
        updateReaderFooter(postData);

        // Comments section.
        await renderCommentsSection(postId, contentDiv);
    } catch (error) {
        addMessage('ERROR', 'FAILED TO LOAD POST: ' + error.message, false, false, true);
        postReaderWindow.style.display = 'none';
        state.mode = 'TUI_PROFILE';
        document.getElementById('profile-viewer-window').style.display = 'flex';
    }
}

function updateReaderFooter(postData) {
    const footer = document.getElementById('post-reader-footer');
    if (!footer) return;
    const isAuthor = state.currentUser && postData.authorId === state.currentUser.uid;
    footer.textContent = isAuthor
        ? '[ESC] Close | [L] Like | [C] Comment | [D] Delete'
        : '[ESC] Close | [L] Like | [C] Comment';
}

async function renderCommentsSection(postId, contentDiv) {
    let section = document.getElementById('post-reader-comments-section');
    if (!section) {
        section = document.createElement('div');
        section.id = 'post-reader-comments-section';
        contentDiv.appendChild(section);
    }
    section.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'post-reader-comments-header';

    let comments = [];
    try { comments = await loadComments(postId); }
    catch (e) { /* permission errors get surfaced when user tries to add */ }

    header.textContent = `COMMENTS (${comments.length}):`;
    section.appendChild(header);

    if (comments.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'post-reader-comment';
        empty.style.opacity = '0.5';
        empty.textContent = '[ NO COMMENTS YET — PRESS C TO ADD ]';
        section.appendChild(empty);
    } else {
        comments.forEach(c => section.appendChild(renderComment(c)));
    }
}

export function openCommentComposer() {
    if (state.mode !== 'TUI_POST_READ' || !state.currentPostId) return;
    if (state.commentDraftOpen) return;
    state.commentDraftOpen = true;

    const contentDiv = document.getElementById('post-reader-content');
    const composer = document.createElement('div');
    composer.className = 'post-reader-comment-composer';
    composer.id = 'post-reader-comment-composer';
    composer.innerHTML = `
        <textarea id="comment-draft-text" placeholder="Type your comment. Use @(name) to mention. Ctrl+Enter to send."></textarea>
        <div class="post-reader-comment-actions">
            <button class="post-cancel-btn" id="comment-cancel-btn" style="font-size:1rem;padding:6px 14px;min-width:auto;">[ CANCEL ]</button>
            <button class="post-publish-btn" id="comment-send-btn" style="font-size:1rem;padding:6px 14px;min-width:auto;">[ SEND ]</button>
        </div>
    `;
    contentDiv.appendChild(composer);

    const ta = document.getElementById('comment-draft-text');
    ta.focus();

    const submit = async () => {
        const id = await addComment(state.currentPostId, ta.value);
        if (id) {
            closeCommentComposer();
            const cd = document.getElementById('post-reader-content');
            await renderCommentsSection(state.currentPostId, cd);
        }
    };

    document.getElementById('comment-send-btn').onclick = submit;
    document.getElementById('comment-cancel-btn').onclick = closeCommentComposer;
    ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
        else if (e.key === 'Escape') { e.preventDefault(); closeCommentComposer(); }
        e.stopPropagation();
    });
}

export function closeCommentComposer() {
    state.commentDraftOpen = false;
    const c = document.getElementById('post-reader-comment-composer');
    if (c) c.remove();
}

// --- Delete post (author only, two-keystroke confirm) ---
export async function deletePost(postId) {
    if (!ensureAuth()) return;
    if (!postId) return;
    try {
        const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'posts', postId);
        const snap = await getDoc(postRef);
        if (!snap.exists()) { addMessage('ERROR', 'POST ALREADY GONE.', false, false, true); return; }
        if (snap.data().authorId !== state.currentUser.uid) {
            addMessage('ERROR', 'PERMISSION DENIED. NOT YOUR POST.', false, false, true);
            return;
        }
        await deleteDoc(postRef);
        addMessage('SYSTEM', 'POST DELETED.', true);
        closeAllWindows();
    } catch (e) {
        addMessage('ERROR', 'DELETE FAILED: ' + e.message, false, false, true);
    }
}

function renderLikesLine(contentDiv, postData) {
    let likesLine = contentDiv.querySelector('.post-reader-likes');
    if (!likesLine) {
        likesLine = document.createElement('div');
        likesLine.className = 'post-reader-likes';
        contentDiv.prepend(likesLine);
    }
    const likedBy = postData.likedBy || [];
    const liked = state.currentUser && likedBy.includes(state.currentUser.uid);
    const count = (typeof postData.likes === 'number') ? postData.likes : likedBy.length;
    likesLine.textContent = `LIKES: ${count}${liked ? '  [♥ LIKED]' : ''}`;
}

// --- Toggle like (per-user) ---
export async function toggleLike(postId) {
    if (!ensureAuth()) return;
    if (!postId) return;

    try {
        const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'posts', postId);
        const postSnap = await getDoc(postRef);
        if (!postSnap.exists()) {
            addMessage('ERROR', 'POST NO LONGER EXISTS.', false, false, true);
            return;
        }
        const data = postSnap.data();
        const likedBy = data.likedBy || [];
        const uid = state.currentUser.uid;
        const alreadyLiked = likedBy.includes(uid);

        const nextCount = Math.max(0, (typeof data.likes === 'number' ? data.likes : likedBy.length) + (alreadyLiked ? -1 : 1));

        await updateDoc(postRef, {
            likedBy: alreadyLiked ? arrayRemove(uid) : arrayUnion(uid),
            likes: nextCount
        });

        // Re-render the likes line with the latest snapshot.
        const refreshed = await getDoc(postRef);
        const contentDiv = document.getElementById('post-reader-content');
        if (contentDiv && refreshed.exists()) {
            renderLikesLine(contentDiv, refreshed.data());
            contentDiv.classList.add('like-flash');
            setTimeout(() => contentDiv.classList.remove('like-flash'), 300);
        }
    } catch (e) {
        if (e.message.includes('permission') || e.message.includes('Permission')) {
            addMessage('ERROR', 'PERMISSION DENIED. Update FIRESTORE_RULES.md to allow likedBy field.', false, false, true);
        } else {
            addMessage('ERROR', 'LIKE FAILED: ' + e.message, false, false, true);
        }
    }
}
