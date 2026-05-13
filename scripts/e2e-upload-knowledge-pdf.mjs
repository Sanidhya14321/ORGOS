#!/usr/bin/env node
/**
 * E2E: log in as CEO (tech seed) and POST multipart PDF to /api/documents/upload.
 *
 *   npm run e2e:generate-handbook-pdf
 *   API_URL=http://localhost:4000 npm run e2e:upload-knowledge-pdf
 *
 * Env: E2E_CEO_EMAIL (default ceo@nexustech.e2e), E2E_CEO_PASSWORD (default = email),
 * E2E_ORG_ID (optional; else from GET /api/me), PDF_PATH (default tmp/e2e/nexus-tech-employee-handbook.pdf)
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
const CEO_EMAIL = process.env.E2E_CEO_EMAIL ?? "ceo@nexustech.e2e";
const CEO_PASSWORD = process.env.E2E_CEO_PASSWORD ?? CEO_EMAIL;
const PDF_PATH =
  process.env.PDF_PATH ?? path.join(rootDir, "tmp", "e2e", "nexus-tech-employee-handbook.pdf");
/** Default vectorless so upload works without OPENAI_API_KEY; set E2E_DOCUMENT_RETRIEVAL_MODE=hybrid when key present */
const RETRIEVAL_MODE = process.env.E2E_DOCUMENT_RETRIEVAL_MODE ?? "vectorless";

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

async function uploadPdf(cookieHeader, orgId, pdfAbsolutePath) {
  const buf = await fs.readFile(pdfAbsolutePath);
  const fileName = path.basename(pdfAbsolutePath);

  const boundary = `----orgosE2e${Date.now().toString(36)}`;
  const crlf = "\r\n";
  const parts = [
    `--${boundary}${crlf}Content-Disposition: form-data; name="org_id"${crlf}${crlf}${orgId}${crlf}`,
    `--${boundary}${crlf}Content-Disposition: form-data; name="doc_type"${crlf}${crlf}process${crlf}`,
    `--${boundary}${crlf}Content-Disposition: form-data; name="retrieval_mode"${crlf}${crlf}${RETRIEVAL_MODE}${crlf}`,
    `--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="${fileName}"${crlf}Content-Type: application/pdf${crlf}${crlf}`,
    buf,
    Buffer.from(`${crlf}--${boundary}--${crlf}`, "utf8")
  ];

  const body = Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p, "utf8"))));

  const res = await fetch(`${API_URL}/api/documents/upload`, {
    method: "POST",
    headers: {
      Cookie: cookieHeader,
      "Content-Type": `multipart/form-data; boundary=${boundary}`
    },
    body
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Upload failed ${res.status}: ${text.slice(0, 600)}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return json;
}

async function main() {
  console.log(`API_URL=${API_URL}`);
  const cookiePair = await login();
  const cookieHeader = cookiePair;
  console.log(`Logged in as ${CEO_EMAIL}`);

  const orgId = await resolveOrgId(cookieHeader);
  console.log(`org_id=${orgId}`);

  const abs = path.isAbsolute(PDF_PATH) ? PDF_PATH : path.join(rootDir, PDF_PATH);
  await fs.access(abs);

  const result = await uploadPdf(cookieHeader, orgId, abs);
  console.log("Upload OK:", JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
