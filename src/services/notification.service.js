import { getFirebaseMessaging } from "../config/firebase.js";

const FCM_MULTICAST_CHUNK_SIZE = 500;

function chunkArray(list = [], chunkSize = FCM_MULTICAST_CHUNK_SIZE) {
  const chunks = [];
  for (let index = 0; index < list.length; index += chunkSize) {
    chunks.push(list.slice(index, index + chunkSize));
  }
  return chunks;
}

function normalizeDataPayload(data = {}) {
  const entries = Object.entries(data || {}).map(([key, value]) => [key, String(value ?? "")]);
  return Object.fromEntries(entries);
}

export async function sendPushNotificationToTokens(tokens = [], payload = {}) {
  const cleanTokens = [...new Set(tokens.map((item) => String(item || "").trim()).filter(Boolean))];
  if (cleanTokens.length === 0) {
    return {
      attempted: 0,
      success: 0,
      failure: 0,
      skipped: true,
      reason: "No valid FCM tokens found",
    };
  }

  const messaging = getFirebaseMessaging();
  if (!messaging) {
    return {
      attempted: 0,
      success: 0,
      failure: 0,
      skipped: true,
      reason: "Firebase not configured",
    };
  }

  let success = 0;
  let failure = 0;
  const invalidTokens = new Set();
  const failureDetails = [];
  const chunks = chunkArray(cleanTokens);

  for (const tokenChunk of chunks) {
    const result = await messaging.sendEachForMulticast({
      tokens: tokenChunk,
      notification: {
        title: String(payload.title || ""),
        body: String(payload.body || ""),
      },
      data: normalizeDataPayload(payload.data || {}),
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "default",
        },
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
      webpush: {
        headers: {
          Urgency: "high",
        },
      },
    });

    success += result.successCount || 0;
    failure += result.failureCount || 0;

    for (let index = 0; index < (result.responses || []).length; index += 1) {
      const item = result.responses[index];
      if (item?.success) continue;

      const token = tokenChunk[index];
      const code = String(item?.error?.code || "");
      const message = String(item?.error?.message || "");

      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token" ||
        code === "messaging/invalid-argument"
      ) {
        invalidTokens.add(token);
      }

      if (failureDetails.length < 20) {
        failureDetails.push({ token, code, message });
      }
    }
  }

  return {
    attempted: cleanTokens.length,
    success,
    failure,
    skipped: false,
    invalidTokens: [...invalidTokens],
    failureDetails,
  };
}
