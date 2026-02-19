import "dotenv/config";
import http from "node:http";
import app from "./app.js";
import { connectDB } from "./config/database.js";
import { connectRedis, disconnectRedis } from "./config/redis.js";
import { initFirebaseAdmin } from "./config/firebase.js";

const PORT = Number(process.env.PORT || 4000);

async function start() {
  try {
    await connectDB();

    await connectRedis();
    initFirebaseAdmin();

    const server = http.createServer(app);
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

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
