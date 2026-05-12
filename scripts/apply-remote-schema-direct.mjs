#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import pg from "pg";

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config({ path: path.join(rootDir, ".env.local"), override: true });

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function readRawEnvValue(name) {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(rootDir, fileName);
    try {
      const contents = await fs.readFile(filePath, "utf8");
      const line = contents
        .split(/\r?\n/)
        .find((entry) => entry.startsWith(`${name}=`));

      if (!line) {
        continue;
      }

      const rawValue = line.slice(name.length + 1).trim();
      if (!rawValue) {
        continue;
      }

      return rawValue.replace(/^"/, "").replace(/"$/, "");
    } catch {
      continue;
    }
  }

  return null;
}

async function readPoolerUrl() {
  const explicit = process.env.SUPABASE_POOLER_URL;
  if (explicit) {
    return explicit;
  }

  const poolerPath = path.join(rootDir, "supabase", ".temp", "pooler-url");
  const file = await fs.readFile(poolerPath, "utf8");
  const value = file.trim();
  if (!value) {
    throw new Error("supabase/.temp/pooler-url is empty");
  }
  return value;
}

function parsePoolerConfig(rawUrl, password) {
  const parsed = new URL(rawUrl);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database: parsed.pathname.replace(/^\//, "") || "postgres",
    user: parsed.username,
    password
  };
}

async function listSchemaFiles() {
  const schemaDir = path.join(rootDir, "packages", "db", "schema");
  const entries = await fs.readdir(schemaDir);
  return entries
    .filter((entry) => entry.endsWith(".sql"))
    .sort()
    .map((entry) => path.join(schemaDir, entry));
}

async function main() {
  const password = (await readRawEnvValue("SUPABASE_DB_PASSWORD")) ?? requiredEnv("SUPABASE_DB_PASSWORD");
  const poolerUrl = await readPoolerUrl();
  const connection = parsePoolerConfig(poolerUrl, password);
  const client = new Client({
    ...connection,
    ssl: { rejectUnauthorized: false }
  });

  console.log("Connecting to remote Postgres via Supabase pooler");
  await client.connect();

  try {
    const schemaFiles = await listSchemaFiles();
    for (const schemaFile of schemaFiles) {
      const fileName = path.basename(schemaFile);
      const sql = await fs.readFile(schemaFile, "utf8");
      console.log(`Applying schema/${fileName}`);
      await client.query(sql);
    }

    const verification = await client.query(`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tasks'
        and column_name = 'assigned_position_id'
    `);

    if (verification.rowCount !== 1) {
      throw new Error("Schema verification failed: tasks.assigned_position_id is still missing");
    }

    console.log("Remote schema apply complete.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
