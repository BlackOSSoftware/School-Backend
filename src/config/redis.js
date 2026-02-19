import { createClient } from "redis";

let redisClient = null;
let redisEnabled = false;

function buildRedisUrl() {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;

  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT;
  const password = process.env.REDIS_PASSWORD;

  if (!host || !port) return null;

  if (password) {
    return `redis://:${encodeURIComponent(password)}@${host}:${port}`;
  }

  return `redis://${host}:${port}`;
}

export async function connectRedis() {
  const redisUrl = buildRedisUrl();

  if (!redisUrl) {
    console.log("Redis disabled: configure REDIS_URL or REDIS_HOST/REDIS_PORT");
    return null;
  }

  try {
    redisClient = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 3000,
        reconnectStrategy: false,
      },
    });

    redisClient.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Redis error:", message);
    });

    await redisClient.connect();
    redisEnabled = true;
    console.log("Redis connected");
    return redisClient;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    redisEnabled = false;
    redisClient = null;
    console.error("Redis disabled: connection failed -", message);
    return null;
  }
}

export async function disconnectRedis() {
  if (redisClient?.isOpen) {
    await redisClient.quit();
  }
  redisEnabled = false;
}

export function isRedisEnabled() {
  return redisEnabled && !!redisClient?.isOpen;
}

export async function getCache(key) {
  if (!isRedisEnabled()) return null;
  return redisClient.get(key);
}

export async function setCache(key, value, ttlSeconds = 120) {
  if (!isRedisEnabled()) return;
  await redisClient.setEx(key, ttlSeconds, value);
}

export async function deleteCacheByPattern(pattern) {
  if (!isRedisEnabled()) return;

  for await (const scannedKeys of redisClient.scanIterator({ MATCH: pattern, COUNT: 500 })) {
    const keys = (Array.isArray(scannedKeys) ? scannedKeys : [scannedKeys])
      .map((item) => String(item || "").trim())
      .filter(Boolean);

    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  }
}
