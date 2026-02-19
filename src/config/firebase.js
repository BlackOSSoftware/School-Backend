import admin from "firebase-admin";
import fs from "node:fs";
import path from "node:path";

let warningShown = false;

function normalizePrivateKey(value = "") {
  return String(value || "").replace(/\\n/g, "\n").trim();
}

function getServiceAccountFromEnv() {
  const rawJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed.private_key) {
        parsed.private_key = normalizePrivateKey(parsed.private_key);
      }
      return parsed;
    } catch (error) {
      console.error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON:", error.message);
      return null;
    }
  }

  const projectId = String(process.env.FIREBASE_PROJECT_ID || "").trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY || "");

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey,
  };
}

function getServiceAccountFromFile() {
  const configuredPath = String(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "").trim();
  const filePath = configuredPath || "firebase-admin-key.json";
  const resolvedPath = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(resolvedPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(resolvedPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.private_key) {
      parsed.private_key = normalizePrivateKey(parsed.private_key);
    }
    return parsed;
  } catch (error) {
    console.error(`Invalid Firebase service account file at ${resolvedPath}:`, error.message);
    return null;
  }
}

export function initFirebaseAdmin() {
  if (admin.apps.length > 0) return true;

  const serviceAccount = getServiceAccountFromFile() || getServiceAccountFromEnv();
  if (!serviceAccount) {
    if (!warningShown) {
      warningShown = true;
      console.warn(
        "Firebase not configured. Add firebase-admin-key.json (or FIREBASE_SERVICE_ACCOUNT_PATH) or set FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY."
      );
    }
    return false;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    return true;
  } catch (error) {
    if (!warningShown) {
      warningShown = true;
      console.error("Failed to initialize Firebase Admin:", error.message);
    }
    return false;
  }
}

export function getFirebaseMessaging() {
  if (!initFirebaseAdmin()) return null;
  return admin.messaging();
}
