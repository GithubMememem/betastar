# Betastar Reloaded — cloud setup

The frontend has a local fallback. Cross-device accounts and shared trades only work after a Firebase project is connected. The Claude preview URLs supplied in the chat could not be fetched by the repository tool, so the five crate images are not yet committed as permanent assets.

## 1. Connect Firebase

1. Create/open a Firebase project at https://console.firebase.google.com/.
2. Enable **Authentication → Sign-in method → Email/Password**.
3. Create a **Cloud Firestore** database.
4. Register a Web app in Project settings and copy its web config.
5. Copy `config.example.js` to `config.js`, then replace all `PASTE` values with the real web config. Commit `config.js` to the deployed site repository.
6. In Authentication → Settings → Authorized domains, add the site's exact host (for example, the GitHub Pages host if that's where the repository is deployed).

The web config is not a server secret. Never put service-account JSON or Admin SDK credentials in the browser.

## 2. Deploy trade acceptance

From a machine with Node.js and the Firebase CLI installed, in this repository run:

```sh
npm install -g firebase-tools
firebase login
firebase use YOUR_FIREBASE_PROJECT_ID
cd functions
npm install
cd ..
firebase deploy --only functions
```

The callable `respondToTrade` uses a Firestore transaction. It checks the signed-in recipient, prevents accepting a trade twice, re-checks both players' current balances and inventories, and transfers both sides atomically.

## 3. Firestore rules requirement

The existing project does not include a Firestore rules file, and its original client writes player profiles directly. Do not deploy broad public-write rules: that would let players edit their own atoms/inventory and undermine trading. Configure rules so that:
- players can read public profile/leaderboard fields, but only authenticated users can read/write their own permitted profile fields;
- chat is readable by signed-in players, new messages require `uid == request.auth.uid`, and deletes are limited to the sender (or a securely established moderator);
- direct-message reads/writes/deletes require membership in the two-user conversation;
- trades are readable only by either participant, creation requires `from == request.auth.uid`, `to != from`, and `status == 'pending'`; clients cannot update accepted trades. The Cloud Function uses Admin SDK to resolve trades.

The current owner role is assigned by the client based on the username `yeebus`; that is not a secure authorization mechanism for a public live game. Before public launch, establish the owner role in trusted server-side data and enforce it in rules/functions.

## 4. Publish

The repository is `GithubMememem/betastar`. If GitHub Pages is enabled for its `main` branch and root folder, each commit to `main` will publish the static HTML changes. Firebase still needs to be configured separately.

## 5. Crate images

Upload the five original image files into the repository (recommended paths: `assets/crates/begging-spungle.png`, `frozen-spungle.png`, `mr-carb.png`, `park-tick.png`, and `drug-spungle.png`). The Claude preview links alone weren't accessible to the repository tool, so they were not embedded as fragile temporary URLs.
