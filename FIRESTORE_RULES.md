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
                                                 request.resource.data.diff(resource.data).affectedKeys().hasOnly(['likes']));
          allow delete: if isAuthenticated() && resource.data.authorId == request.auth.uid;
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
   - Users can update their own posts or just the `likes` field
   - Users can delete their own posts

4. **User Profiles**:
   - Anyone authenticated can read profiles
   - Users can only write to their own profile

5. **Messages**:
   - Users can read all messages (for chat functionality)
   - Users can only create messages with their own `senderId`
   - Users can only update/delete their own messages

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

