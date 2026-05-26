// profile-editor.js — TUI overlay for editing nickname / bio / avatar.

import {
    doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { db, appId } from './firebase-config.js';
import { state } from './state.js';
import {
    editorOverlay, editNick, editBio, editAvatar, editorElements,
    fileInput, input, addMessage, SoundSys
} from './ui.js';
import { ensureAuth } from './auth.js';

export function openProfileEditor() {
    if (!ensureAuth()) return;
    state.mode = 'PROFILE_EDIT';
    editorOverlay.style.display = 'flex';

    const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'user_profiles', state.currentUser.uid);
    getDoc(userRef).then(snap => {
        if (snap.exists()) {
            const d = snap.data();
            editNick.textContent = d.displayName || '';
            editBio.textContent = d.bio || '';
            if (d.avatarAscii) {
                state.editorAvatarBuffer = d.avatarAscii;
                editAvatar.textContent = "[ IMAGE SET ]";
            }
        }
    });

    state.editorSelection = 0;
    state.editorIsEditing = false;
    updateEditorVisuals();
    setupEditorClicks();
}

export function closeProfileEditor() {
    state.mode = 'COMMAND';
    editorOverlay.style.display = 'none';
    state.editorIsEditing = false;
    input.focus();
}

export async function saveProfileEditor() {
    addMessage('SYSTEM', 'SAVING PROFILE...', true);
    const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'user_profiles', state.currentUser.uid);

    const rawNick = editNick.textContent.trim();
    const dataToUpdate = {
        displayName: rawNick,
        displayNameLower: rawNick.toLowerCase(),
        bio: editBio.textContent.trim()
    };
    if (state.editorAvatarBuffer) dataToUpdate.avatarAscii = state.editorAvatarBuffer;

    await setDoc(userRef, dataToUpdate, { merge: true });
    addMessage('SYSTEM', 'PROFILE UPDATED SUCCESSFULLY.', true);
    closeProfileEditor();
}

export function updateEditorVisuals() {
    editorElements.forEach(el => {
        el.classList.remove('active');
        el.classList.remove('editing');
    });
    const currentEl = editorElements[state.editorSelection];
    currentEl.classList.add('active');
    if (state.editorIsEditing) currentEl.classList.add('editing');
}

export function setupEditorClicks() {
    document.getElementById('row-nick').onclick = () => handleEditorInteraction(0);
    document.getElementById('row-bio').onclick = () => handleEditorInteraction(1);
    document.getElementById('row-avatar').onclick = () => handleEditorInteraction(2);
    document.getElementById('btn-save').onclick = () => handleEditorInteraction(3);
    document.getElementById('btn-cancel').onclick = () => handleEditorInteraction(4);
}

function handleEditorInteraction(index) {
    if (state.editorSelection !== index) {
        state.editorSelection = index;
        state.editorIsEditing = false;
        SoundSys.blip();
        updateEditorVisuals();
        return;
    }
    SoundSys.click();

    if (index === 0) activateInlineInput(editNick);
    else if (index === 1) activateInlineInput(editBio);
    else if (index === 2) fileInput.click();
    else if (index === 3) saveProfileEditor();
    else if (index === 4) closeProfileEditor();
}

export function activateInlineInput(element) {
    if (element.querySelector('input')) return;

    state.editorIsEditing = true;
    const currentText = element.textContent;
    element.textContent = '';

    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.value = currentText;
    inputEl.className = 'terminal-inline-input';

    inputEl.addEventListener('blur', () => commitInlineInput(element, inputEl));
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            inputEl.blur();
        } else if (e.key === 'Tab') {
            e.preventDefault();
            inputEl.blur();
            state.editorSelection = (state.editorSelection + 1) % editorElements.length;
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
    wrapperElement.textContent = inputElement.value;
    state.editorIsEditing = false;
    updateEditorVisuals();
}

export function handleProfileEditorKey(e) {
    if (state.editorIsEditing) return;

    if (e.key === 'Tab' || e.key === 'ArrowDown') {
        e.preventDefault();
        state.editorSelection = (state.editorSelection + 1) % editorElements.length;
        SoundSys.blip();
        updateEditorVisuals();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.editorSelection = (state.editorSelection - 1 + editorElements.length) % editorElements.length;
        SoundSys.blip();
        updateEditorVisuals();
    } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        SoundSys.click();

        if (state.editorSelection === 0) activateInlineInput(editNick);
        else if (state.editorSelection === 1) activateInlineInput(editBio);
        else if (state.editorSelection === 2) fileInput.click();
        else if (state.editorSelection === 3) saveProfileEditor();
        else if (state.editorSelection === 4) closeProfileEditor();
    }
}
