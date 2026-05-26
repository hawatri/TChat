// state.js — single source of truth for mutable runtime state.
// Modules import this object and mutate its keys directly. Keep this file
// dependency-free so other modules can import it without cycles.

export const state = {
    // App mode: COMMAND, CHAT, RADIO, PROFILE_EDIT, TUI_PROFILE,
    // TUI_POST_WRITE, TUI_POST_READ, TUI_FEED
    mode: 'COMMAND',
    muted: false,
    booting: true,
    theme: 'green',
    activeWindow: null,
    menuIndex: 0,

    // Auth + chat partner
    currentUser: null,
    currentChatPartner: null,

    // Firestore listener handles — null until attached
    messagesUnsubscribe: null,
    notificationUnsubscribe: null,
    channelMetaUnsubscribe: null,

    // Radio session
    activeRadioParticipants: new Set(),
    currentChannelAdmins: [],

    // Command history
    cmdHistory: [],
    historyIndex: -1,

    // Message DOM map (id -> div) for burn deletion / removal animation
    msgMap: new Map(),

    // Profile editor session
    editorSelection: 0,
    editorIsEditing: false,
    editorAvatarBuffer: null,

    // Post writer session
    currentPostAscii: null,
    isPublishing: false,

    // Post reader — needed for likes
    currentPostId: null,

    // Autocomplete
    autocompleteOptions: [],
    autocompleteIndex: -1
};
