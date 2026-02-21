import "dotenv/config";
import http from "node:http";
import app from "./app.js";
import { connectDB } from "./config/database.js";
import { connectRedis, disconnectRedis } from "./config/redis.js";
import { initFirebaseAdmin } from "./config/firebase.js";

const PORT = Number(process.env.PORT || 4000);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 0);
const HEADERS_TIMEOUT_MS = Number(process.env.HEADERS_TIMEOUT_MS || 120000);

async function start() {
  try {
    await connectDB();

    await connectRedis();
    initFirebaseAdmin();

    const server = http.createServer(app);
    server.requestTimeout = REQUEST_TIMEOUT_MS;
    server.keepAliveTimeout = 65000;
    server.headersTimeout = HEADERS_TIMEOUT_MS;

    server.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });

    const closeRedisAndExit = async () => {
      await disconnectRedis();
      process.exit(0);
    };

    process.on("SIGINT", closeRedisAndExit);
    process.on("SIGTERM", closeRedisAndExit);
  } catch (error) {
    console.error("Startup error:", error);
    process.exit(1);
  }
}

start();
