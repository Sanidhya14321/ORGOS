#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import { RedisMemoryServer } from "redis-memory-server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config({ path: path.join(rootDir, ".env.local"), override: true });

const password = process.env.UPSTASH_REDIS_TOKEN;

if (!password) {
  console.error("Missing UPSTASH_REDIS_TOKEN in .env/.env.local");
  process.exit(1);
}

const redisServer = new RedisMemoryServer({
  instance: {
    port: 6380,
    ip: "127.0.0.1",
    args: ["--requirepass", password]
  }
});

const host = await redisServer.getHost();
const port = await redisServer.getPort();

console.log(`Local Redis ready at redis://${host}:${port}`);

const shutdown = async () => {
  await redisServer.stop();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});

await new Promise(() => {});
