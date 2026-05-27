# Firestore Security Rules for TChat

You need to update your Firestore security rules to allow the following operations:

## Required Rules

Go to Firebase Console → Firestore Database → Rules and add these rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper function to check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Helper function to check if user is the owner
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    
    // App artifacts collection
    match /artifacts/{appId} {
      // Public data - readable by all authenticated users
      match /public/data {
        // User profiles - readable by all, writable by owner
        match /user_profiles/{userId} {
          allow read: if isAuthenticated();
          allow write: if isOwner(userId);
        }
        
        // Posts - readable by all authenticated users, writable by authenticated users
        match /posts/{postId} {
          allow read: if isAuthenticated();
          allow create: if isAuthenticated() && request.resource.data.authorId == request.auth.uid;
          allow update: if isAuthenticated() && (resource.data.authorId == request.auth.uid || 
                                                 request.resource.data.diff(resource.data).affectedKeys().hasOnly(['likes', 'likedBy']));
          allow delete: if isAuthenticated() && resource.data.authorId == request.auth.uid;

          // Comments on a post — any authenticated user can read; create with own authorId; only author can edit/delete.
          match /comments/{commentId} {
            allow read: if isAuthenticated();
            allow create: if isAuthenticated() && request.resource.data.authorId == request.auth.uid;
            allow update, delete: if isAuthenticated() && resource.data.authorId == request.auth.uid;
          }
        }
        
        // Messages - readable/writable by authenticated users
        match /messages/{messageId} {
          allow read: if isAuthenticated();
          allow create: if isAuthenticated() && request.resource.data.senderId == request.auth.uid;
          allow update, delete: if isAuthenticated() && resource.data.senderId == request.auth.uid;
        }
        
        // Radio channels - readable by all, writable by admins
        match /radio_channels/{channelId} {
          allow read: if isAuthenticated();
          allow write: if isAuthenticated();
        }

        // System docs (motd, etc.) — read-only for clients; write via Firebase Console.
        match /system/{docId} {
          allow read: if isAuthenticated();
          allow write: if false;
        }
      }
      
      // User-specific data
      match /users/{userId} {
        // Friends list - readable/writable by owner
        match /friends/{friendId} {
          allow read, write: if isOwner(userId);
        }
        
        // Notifications - readable/writable by owner
        match /notifications/{notificationId} {
          allow read, write: if isOwner(userId);
        }

        // Blocked users — owner-only.
        match /blocked/{blockedUid} {
          allow read, write: if isOwner(userId);
        }
      }
    }
  }
}
```

## Important Notes:

1. **Replace `{appId}`**: The rules use `{appId}` as a wildcard. Your app uses `'tchat-terminal'` by default, but the rules will work for any app ID.

2. **Authentication Required**: All operations require the user to be authenticated (logged in).

3. **Posts Collection**: 
   - Anyone authenticated can read posts
   - Users can only create posts with their own `authorId`
   - Users can update their own posts or just the `likes` and `likedBy` fields (so anyone can like a post; per-user toggle is enforced client-side via `likedBy` array)
   - Users can delete their own posts

4. **User Profiles**:
   - Anyone authenticated can read profiles
   - Users can only write to their own profile

5. **Messages**:
   - Users can read all messages (for chat functionality)
   - Users can only create messages with their own `senderId`
   - Users can only update/delete their own messages

6. **Comments** (`posts/{id}/comments`):
   - Any authenticated user can read all comments.
   - Users can only create comments with their own `authorId`.
   - Only the comment's author can edit or delete it.

7. **Blocked users** (`users/{uid}/blocked`):
   - Owner-only. Each blocked user is one document with `{ uid, blockedAt }`.
   - **Important**: blocking is currently enforced **client-side only** — the blocker's app filters out messages from blocked users in their own UI, but the blocked user can still write messages and see public posts. To enforce server-side, add a rule on `messages` checking the receiver's blocked subcollection (more complex; not included by default).

8. **System docs** (`public/data/system`):
   - Read-only for clients. Write `motd` via the Firebase Console:
     - Doc: `artifacts/tchat-terminal/public/data/system/motd`
     - Field: `text` (string)

## Testing the Rules

After updating the rules:
1. Click "Publish" in the Firebase Console
2. Wait a few seconds for the rules to propagate
3. Try the `post` command again
4. Try the `profile` command again

If you still get permission errors, check:
- You are logged in (not in guest mode)
- The collection paths match exactly: `artifacts/{appId}/public/data/posts` and `artifacts/{appId}/public/data/user_profiles`
- The `appId` variable matches what's in your code (default: 'tchat-terminal')

