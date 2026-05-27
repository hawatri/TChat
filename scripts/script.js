// script.js — entry point. Wires modules together, owns global event listeners.

import { state } from './state.js';
import {
    input, autocompleteMenu, fileInput, tabBtn,
    addMessage, updateInputDisplay, hideAutocomplete, highlightOption,
    handleTabCompletion, runBootSequence, closeAllWindows,
    handleListNavigation, SoundSys
} from './ui.js';
import { convertImageToAscii } from './utils.js';
import { setupAuthStateListener } from './auth.js';
import { processCommand } from './commands.js';
import { processChatInput, sendMessage } from './chat.js';
import { handleProfileEditorKey } from './profile-editor.js';
import { openPostReader, toggleLike, deletePost, openCommentComposer } from './posts.js';
import { openFeed } from './feed.js';

// --- Auth bootstrap ---
setupAuthStateListener();

// --- Boot the terminal ---
window.onload = runBootSequence;

// --- File upload handler ---
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (state.mode === 'TUI_POST_WRITE') {
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const ascii = await convertImageToAscii(event.target.result);
                state.currentPostAscii = ascii;
                const previewDiv = document.getElementById('post-ascii-preview');
                previewDiv.textContent = ascii;
                previewDiv.classList.add('ascii-art');
                setTimeout(() => {
                    const bodyTextarea = document.getElementById('post-body');
                    if (bodyTextarea) bodyTextarea.focus();
                }, 100);
            } catch (e) {
                document.getElementById('post-ascii-preview').textContent = "[ ERROR CONVERTING ]";
                setTimeout(() => {
                    const bodyTextarea = document.getElementById('post-body');
                    if (bodyTextarea) bodyTextarea.focus();
                }, 100);
            }
            fileInput.value = '';
        };
        reader.readAsDataURL(file);
        return;
    }

    if (state.mode === 'PROFILE_EDIT') {
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const ascii = await convertImageToAscii(event.target.result);
                state.editorAvatarBuffer = ascii;
                document.getElementById('edit-avatar').textContent = "[ IMAGE SET (ASCII GENERATED) ]";
            } catch (e) {
                document.getElementById('edit-avatar').textContent = "[ ERROR CONVERTING ]";
            }
            fileInput.value = '';
        };
        reader.readAsDataURL(file);
        return;
    }

    // Normal chat / command-mode upload
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
        } catch (err) {
            addMessage('ERROR', 'CONVERSION FAILED: ' + err.message, false, false, true);
        }
        fileInput.value = '';
    };
    reader.readAsDataURL(file);
});

// --- TAB button (mobile) ---
tabBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (state.mode === 'PROFILE_EDIT') {
        handleProfileEditorKey({ key: 'Tab', preventDefault: () => {} });
    } else {
        input.focus();
        handleTabCompletion({ preventDefault: () => {} });
    }
});

// --- Global keydown router (TUI windows) ---
document.addEventListener('keydown', (event) => {
    // Escape: close current TUI window, with post reader → profile viewer fallback.
    if (event.key === 'Escape') {
        // Cancel a pending delete confirmation before anything else.
        if (state.pendingDelete) {
            state.pendingDelete = false;
            addMessage('SYSTEM', 'DELETE CANCELLED.', true);
            event.preventDefault();
            return;
        }
        // Close the comment composer first if it's open inside the reader.
        if (state.mode === 'TUI_POST_READ' && state.commentDraftOpen) {
            event.preventDefault();
            // Lazy import not needed — module is already loaded.
            const composer = document.getElementById('post-reader-comment-composer');
            if (composer) composer.remove();
            state.commentDraftOpen = false;
            return;
        }
        if (state.mode === 'TUI_POST_READ') {
            event.preventDefault();
            document.getElementById('post-reader-window').style.display = 'none';
            // If a profile viewer is also open underneath, return to it; otherwise close everything.
            const profileWindow = document.getElementById('profile-viewer-window');
            const feedWindow = document.getElementById('feed-window');
            if (profileWindow && profileWindow.dataset.previouslyOpen === '1') {
                state.mode = 'TUI_PROFILE';
                profileWindow.style.display = 'flex';
            } else if (feedWindow && feedWindow.dataset.previouslyOpen === '1') {
                state.mode = 'TUI_FEED';
                feedWindow.style.display = 'flex';
            } else {
                closeAllWindows();
            }
            return;
        }
        const tuiModes = ['PROFILE_EDIT', 'TUI_PROFILE', 'TUI_POST_WRITE', 'TUI_FEED'];
        if (tuiModes.includes(state.mode)) {
            event.preventDefault();
            closeAllWindows();
            return;
        }
    }

    // Like / Comment / Delete in post reader.
    if (state.mode === 'TUI_POST_READ') {
        // Skip these single-letter shortcuts when the comment composer textarea is focused.
        const focused = document.activeElement;
        const inComposer = focused && focused.id === 'comment-draft-text';
        if (!inComposer) {
            if (event.key === 'l' || event.key === 'L') {
                event.preventDefault();
                toggleLike(state.currentPostId);
                return;
            }
            if (event.key === 'c' || event.key === 'C') {
                event.preventDefault();
                openCommentComposer();
                return;
            }
            if (event.key === 'd' || event.key === 'D') {
                event.preventDefault();
                state.pendingDelete = true;
                addMessage('SYSTEM', 'CONFIRM DELETE? PRESS [Y] TO CONFIRM, [ESC] TO CANCEL.', true);
                return;
            }
            if ((event.key === 'y' || event.key === 'Y') && state.pendingDelete) {
                event.preventDefault();
                state.pendingDelete = false;
                deletePost(state.currentPostId);
                return;
            }
        }
    }

    // Profile viewer post-list nav.
    if (state.mode === 'TUI_PROFILE') {
        if (handleListNavigation(event, '#profile-post-list', (postId) => {
            // Mark profile viewer as "underneath" so Escape from reader returns here.
            document.getElementById('profile-viewer-window').dataset.previouslyOpen = '1';
            const feedWindow = document.getElementById('feed-window');
            if (feedWindow) feedWindow.dataset.previouslyOpen = '0';
            openPostReader(postId);
        })) return;
    }

    // Feed post-list nav.
    if (state.mode === 'TUI_FEED') {
        if (handleListNavigation(event, '#feed-post-list', (postId) => {
            document.getElementById('feed-window').dataset.previouslyOpen = '1';
            const profileWindow = document.getElementById('profile-viewer-window');
            if (profileWindow) profileWindow.dataset.previouslyOpen = '0';
            openPostReader(postId);
        })) return;
    }

    // Post writer: route stray keystrokes to body textarea.
    if (state.mode === 'TUI_POST_WRITE') {
        const activeElement = document.activeElement;
        const isPostField = activeElement && (
            activeElement.id === 'post-title' ||
            activeElement.id === 'post-body'
        );
        if (event.key === 'Escape') return;
        if (!isPostField && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const bodyTextarea = document.getElementById('post-body');
            if (bodyTextarea) {
                bodyTextarea.focus();
                const start = bodyTextarea.selectionStart;
                const end = bodyTextarea.selectionEnd;
                const text = bodyTextarea.value;
                bodyTextarea.value = text.substring(0, start) + event.key + text.substring(end);
                bodyTextarea.selectionStart = bodyTextarea.selectionEnd = start + 1;
                event.preventDefault();
            }
        }
        return;
    }

    if (state.mode === 'PROFILE_EDIT') {
        handleProfileEditorKey(event);
        return;
    }
});

// --- Input keydown handler ---
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
            state.autocompleteIndex = (state.autocompleteIndex - 1 + state.autocompleteOptions.length) % state.autocompleteOptions.length;
            highlightOption(state.autocompleteIndex);
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            state.autocompleteIndex = (state.autocompleteIndex + 1) % state.autocompleteOptions.length;
            highlightOption(state.autocompleteIndex);
            return;
        }
        if (event.key === 'Enter') {
            if (state.autocompleteIndex >= 0) {
                event.preventDefault();
                // Use confirmSelection through a re-import — cheaper to just inline a click.
                const items = autocompleteMenu.children;
                if (items[state.autocompleteIndex]) items[state.autocompleteIndex].click();
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
            if (state.cmdHistory.length > 0) {
                if (state.historyIndex < state.cmdHistory.length - 1) {
                    state.historyIndex++;
                    input.value = state.cmdHistory[state.cmdHistory.length - 1 - state.historyIndex];
                    updateInputDisplay();
                }
            }
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (state.historyIndex > 0) {
                state.historyIndex--;
                input.value = state.cmdHistory[state.cmdHistory.length - 1 - state.historyIndex];
            } else if (state.historyIndex === 0) {
                state.historyIndex = -1;
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

        if (event.shiftKey) return;

        if (trimmed !== "") {
            state.cmdHistory.push(trimmed);
            state.historyIndex = -1;

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

// --- Click anywhere → focus input (except in profile editor / over autocomplete) ---
document.addEventListener('click', (e) => {
    if (state.mode === 'PROFILE_EDIT') return;

    input.focus();
    SoundSys.init();
    if (e.target !== autocompleteMenu && e.target.parentElement !== autocompleteMenu && e.target !== tabBtn) {
        hideAutocomplete();
    }
});

// --- Mobile: keep the input visible when the soft keyboard opens ---
input.addEventListener('focus', () => {
    // Phones bring up the keyboard on focus; scroll the input into view so it isn't hidden.
    setTimeout(() => {
        try { input.scrollIntoView({ block: 'end', behavior: 'smooth' }); } catch (e) { /* older browsers */ }
    }, 100);
});
