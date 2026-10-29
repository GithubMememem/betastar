const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

function checkedPack(pack) {
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) {
    throw new HttpsError("invalid-argument", "Invalid trade pack.");
  }
  const atoms = pack.atoms;
  if (!Number.isSafeInteger(atoms) || atoms < 0) {
    throw new HttpsError("invalid-argument", "Atoms must be a non-negative whole number.");
  }
  const els = pack.els || {};
  if (!els || typeof els !== "object" || Array.isArray(els)) {
    throw new HttpsError("invalid-argument", "Invalid element list.");
  }
  const clean = {};
  for (const [key, value] of Object.entries(els)) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(key) || !Number.isSafeInteger(value) || value < 0) {
      throw new HttpsError("invalid-argument", "Invalid element quantity.");
    }
    if (value > 0) clean[key] = value;
  }
  return {atoms, els: clean};
}

function movePack(src, dst, pack) {
  const clean = checkedPack(pack);
  if (!src || !dst || !Number.isSafeInteger(src.atoms) || src.atoms < clean.atoms) {
    throw new HttpsError("failed-precondition", "A player no longer has enough atoms.");
  }
  const srcEls = {...(src.els || {})};
  const dstEls = {...(dst.els || {})};
  for (const [key, qty] of Object.entries(clean.els)) {
    if (!Number.isSafeInteger(srcEls[key] || 0) || (srcEls[key] || 0) < qty) {
      throw new HttpsError("failed-precondition", "A player no longer has enough of an offered element.");
    }
    srcEls[key] = (srcEls[key] || 0) - qty;
    if (!srcEls[key]) delete srcEls[key];
    dstEls[key] = (dstEls[key] || 0) + qty;
    if (!Number.isSafeInteger(dstEls[key])) {
      throw new HttpsError("failed-precondition", "Element quantity overflow.");
    }
  }
  src.atoms -= clean.atoms;
  dst.atoms += clean.atoms;
  if (!Number.isSafeInteger(dst.atoms)) {
    throw new HttpsError("failed-precondition", "Atom quantity overflow.");
  }
  src.els = srcEls;
  dst.els = dstEls;
}

exports.respondToTrade = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to respond to trades.");
  const uid = request.auth.uid;
  const {tradeId, action} = request.data || {};
  if (typeof tradeId !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(tradeId)) {
    throw new HttpsError("invalid-argument", "Invalid trade ID.");
  }
  if (action !== "accept" && action !== "decline") {
    throw new HttpsError("invalid-argument", "Choose accept or decline.");
  }

  const tradeRef = db.collection("trades").doc(tradeId);
  return db.runTransaction(async (tx) => {
    const tradeSnap = await tx.get(tradeRef);
    if (!tradeSnap.exists) throw new HttpsError("not-found", "Trade not found.");
    const trade = tradeSnap.data();
    if (trade.to !== uid) throw new HttpsError("permission-denied", "Only the recipient can respond.");
    if (trade.status !== "pending") throw new HttpsError("failed-precondition", "This trade has already been resolved.");
    if (trade.from === trade.to || !Array.isArray(trade.participants) ||
        !trade.participants.includes(trade.from) || !trade.participants.includes(trade.to)) {
      throw new HttpsError("failed-precondition", "Trade data is invalid.");
    }

    if (action === "decline") {
      tx.update(tradeRef, {status: "declined", resolvedAt: FieldValue.serverTimestamp()});
      return {status: "declined"};
    }

    const fromRef = db.collection("players").doc(trade.from);
    const toRef = db.collection("players").doc(trade.to);
    const [fromSnap, toSnap] = await Promise.all([tx.get(fromRef), tx.get(toRef)]);
    if (!fromSnap.exists || !toSnap.exists) throw new HttpsError("not-found", "Player profile missing.");
    const from = fromSnap.data();
    const to = toSnap.data();
    movePack(from, to, checkedPack(trade.offer));
    movePack(to, from, checkedPack(trade.want));
    tx.update(fromRef, {atoms: from.atoms, els: from.els});
    tx.update(toRef, {atoms: to.atoms, els: to.els});
    tx.update(tradeRef, {status: "accepted", resolvedAt: FieldValue.serverTimestamp()});
    return {status: "accepted"};
  });
});
