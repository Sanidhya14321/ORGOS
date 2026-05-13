#!/usr/bin/env node
/**
 * E2E: CEO session → parse-preview (multipart) → optional commit import.
 *
 *   API_URL=http://localhost:4000 node scripts/e2e-import-positions.mjs
 *
 * Env:
 *   E2E_CEO_EMAIL (default ceo@nexustech-e2e.org), E2E_CEO_PASSWORD (= email by default)
 *   E2E_ORG_ID (optional; else from GET /api/me)
 *   POSITIONS_CSV (default scripts/fixtures/e2e-positions.csv)
 *   E2E_POSITIONS_COMMIT=1 — also POST /api/onboarding/positions/import (creates seats in DB)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config({ path: path.join(rootDir, ".env.local"), override: true });

const API_URL = (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const CEO_EMAIL = process.env.E2E_CEO_EMAIL ?? "ceo@nexustech-e2e.org";
const CEO_PASSWORD = process.env.E2E_CEO_PASSWORD ?? CEO_EMAIL;
const CSV_PATH =
  process.env.POSITIONS_CSV ?? path.join(rootDir, "scripts", "fixtures", "e2e-positions.csv");
const DO_COMMIT = process.env.E2E_POSITIONS_COMMIT === "1";

function cookiePairFromSetCookies(setCookies) {
  if (!setCookies?.length) {
    return null;
  }
  for (const line of setCookies) {
    if (line.startsWith("orgos_access_token=")) {
      return line.split(";")[0]?.trim() ?? null;
    }
  }
  return null;
}

async function login() {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: CEO_EMAIL, password: CEO_PASSWORD })
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Login failed ${res.status}: ${t.slice(0, 400)}`);
  }

  const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  let pair = cookiePairFromSetCookies(setCookies);
  if (!pair) {
    const single = res.headers.get("set-cookie");
    if (single) {
      const chunks = single.split(/,(?=[^;]+?=)/);
      pair = cookiePairFromSetCookies(chunks.map((c) => c.trim()));
    }
  }
  if (!pair) {
    throw new Error("No orgos_access_token in Set-Cookie headers");
  }
  return pair;
}

async function resolveOrgId(cookieHeader) {
  if (process.env.E2E_ORG_ID) {
    return process.env.E2E_ORG_ID;
  }

  const res = await fetch(`${API_URL}/api/me`, {
    headers: { Cookie: cookieHeader }
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GET /api/me failed ${res.status}: ${t.slice(0, 400)}`);
  }

  const profile = await res.json();
  const orgId = profile.org_id ?? profile.orgId;
  if (typeof orgId !== "string" || !orgId) {
    throw new Error("Profile missing org_id; set E2E_ORG_ID");
  }
  return orgId;
}

async function parsePreview(cookieHeader, orgId, csvAbsolutePath) {
  const buf = await fs.readFile(csvAbsolutePath);
  const fileName = path.basename(csvAbsolutePath);

  const form = new FormData();
  form.set("org_id", orgId);
  form.set("file", new Blob([buf], { type: "text/csv" }), fileName);

  const res = await fetch(`${API_URL}/api/onboarding/positions/parse-preview`, {
    method: "POST",
    headers: { Cookie: cookieHeader },
    body: form
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`parse-preview non-JSON ${res.status}: ${text.slice(0, 500)}`);
  }

  if (!res.ok) {
    throw new Error(`parse-preview ${res.status}: ${text.slice(0, 600)}`);
  }
  return json;
}

async function commitImport(cookieHeader, orgId, preview) {
  const res = await fetch(`${API_URL}/api/onboarding/positions/import`, {
    method: "POST",
    headers: {
      Cookie: cookieHeader,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      org_id: orgId,
      import_source: "file",
      branches: preview.branches ?? [],
      positions: preview.positions
    })
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`import ${res.status}: ${text.slice(0, 600)}`);
  }
  return JSON.parse(text);
}

async function main() {
  console.log(`API_URL=${API_URL} CEO=${CEO_EMAIL} CSV=${CSV_PATH} commit=${DO_COMMIT}`);
  const cookie = await login();
  const orgId = await resolveOrgId(cookie);
  console.log(`org_id=${orgId}`);

  const preview = await parsePreview(cookie, orgId, CSV_PATH);
  console.log(
    `Preview OK: ${preview.stats?.position_count ?? "?"} positions, ` +
      `${preview.stats?.branch_count ?? "?"} branches, format=${preview.source_format}`
  );
  console.log("Titles:", (preview.positions ?? []).map((p) => p.title).join(", "));

  if (DO_COMMIT) {
    const out = await commitImport(cookie, orgId, preview);
    console.log("Import result:", out);
  } else {
    console.log("Dry-run only. Set E2E_POSITIONS_COMMIT=1 to POST /api/onboarding/positions/import.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
