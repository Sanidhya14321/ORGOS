#!/usr/bin/env node
/**
 * Generate a multi-section employee handbook PDF for E2E knowledge upload.
 * LLM text source (first match wins): `OPENAI_API_KEY` → OpenAI;
 * else `GROQ_API_KEY` → Groq (`https://api.groq.com/openai/v1/chat/completions`);
 * else static handbook (still valid PDF).
 *
 *   node scripts/generate-tech-handbook-pdf.mjs
 *   GROQ_HANDBOOK_MODEL=llama-3.3-70b-versatile node scripts/generate-tech-handbook-pdf.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config({ path: path.join(rootDir, ".env.local"), override: true });

const outPath =
  process.env.OUT_PATH ?? path.join(rootDir, "tmp", "e2e", "nexus-tech-employee-handbook.pdf");

function handbookMessages() {
  return [
    {
      role: "system",
      content: `You write realistic internal employee handbooks for a B2B tech solutions company.
Company: Nexus Tech Solutions. Services: cloud migration, managed SOC, SaaS integrations, 24x7 NOC.
Output strict JSON with shape: { "sections": [ { "title": string, "body": string } ] }.
Exactly 6 sections. Each body 150-280 words (concise but substantive), plain text paragraphs separated by blank lines (use \\n\\n). No markdown headings inside body. Reply with ONLY the JSON object — no markdown fences, no prose before or after.`
    },
    {
      role: "user",
      content:
        "Generate handbook sections: Company mission & values; Security & acceptable use (include RACI snippet for incident response); Remote work & equipment; Time off & conduct; Customer data handling & confidentiality; Career growth & certifications."
    }
  ];
}

function parseSectionsJson(raw, label) {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.sections)) {
    throw new Error(`${label}: JSON missing sections array`);
  }
  return parsed.sections.map((s) => ({
    title: String(s.title ?? "Section"),
    body: String(s.body ?? "")
  }));
}

/**
 * @param {{ url: string; apiKey: string; model: string; label: string; structuredJson?: boolean }} opts
 */
async function fetchHandbookViaChatCompletions(opts) {
  const { url, apiKey, model, label, structuredJson = false } = opts;
  const body = {
    model,
    messages: handbookMessages(),
    temperature: 0.4,
    max_tokens: url.includes("groq.com") ? 4096 : 12_000
  };
  if (structuredJson) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${label} error ${res.status}: ${t.slice(0, 500)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;
  if (typeof raw !== "string") {
    throw new Error(`${label} returned no message content`);
  }

  try {
    return parseSectionsJson(raw, label);
  } catch (first) {
    const jsonMatch = raw.match(/\{[\s\S]*"sections"\s*:\s*\[[\s\S]*\]\s*}/);
    if (jsonMatch) {
      return parseSectionsJson(jsonMatch[0], label);
    }
    throw first;
  }
}

async function fetchHandbookSections() {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const model = process.env.OPENAI_HANDBOOK_MODEL ?? "gpt-4o-mini";
    return fetchHandbookViaChatCompletions({
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: openaiKey,
      model,
      label: "OpenAI",
      structuredJson: true
    });
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    const model = process.env.GROQ_HANDBOOK_MODEL ?? "llama-3.3-70b-versatile";
    return fetchHandbookViaChatCompletions({
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: groqKey,
      model,
      label: "Groq",
      structuredJson: false
    });
  }

  console.warn("No OPENAI_API_KEY or GROQ_API_KEY — using static handbook sections for offline E2E.");
  return staticHandbookSections();
}

function staticHandbookSections() {
  return [
    {
      title: "Company mission & values",
      body: `Nexus Tech Solutions delivers secure cloud migration, managed SOC, and SaaS integration for regulated enterprises.\n\nWe value customer outcomes, blameless postmortems, and transparent communication. Every employee is expected to protect customer trust and follow the least-privilege principle when accessing systems or data.`
    },
    {
      title: "Security & acceptable use",
      body: `All laptops run full-disk encryption and mobile device management. Phishing simulations run quarterly.\n\nIncident RACI: Detection (NOC) is Responsible; Triage (Security Engineering) is Accountable; Customer comms (Customer Success lead) is Consulted; Legal review is Informed for contractual breach language.\n\nReport suspected incidents within 15 minutes using the internal security hotline.`
    },
    {
      title: "Remote work & equipment",
      body: `Nexus is remote-first with optional access to Americas HQ and EMEA hubs. Company-issued hardware must not be used by family members.\n\nVPN is mandatory for admin access. Home networks should use WPA3 where available. Lost or stolen devices must be reported immediately to IT.`
    },
    {
      title: "Time off & conduct",
      body: `Request PTO at least two weeks ahead for blocks longer than three days. On-call swaps require manager approval in writing.\n\nHarassment and discrimination are prohibited. Retaliation for good-faith reporting is grounds for termination.`
    },
    {
      title: "Customer data handling",
      body: `Customer production credentials live only in the approved secrets manager. No long-lived keys in email or chat.\n\nData residency: EU customer workloads default to EMEA regions unless contract specifies otherwise. Export controls apply to certain jurisdictions—check Legal before onboarding new logos.`
    },
    {
      title: "Career growth & certifications",
      body: `Each employee maintains a personal growth plan reviewed twice yearly. Nexus reimburses one certification attempt per year for approved cloud and security tracks.\n\nInternal guilds cover platform engineering, detection engineering, and solutions architecture—join at least one.`
    }
  ];
}

async function writePdf(sections, filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const { createWriteStream } = await import("node:fs");

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const stream = createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(18).text("Nexus Tech Solutions — Employee Handbook (E2E)", { align: "center" });
    doc.moveDown(1.5);

    sections.forEach((section, index) => {
      if (index > 0) {
        doc.addPage();
      }
      doc.fontSize(14).fillColor("#111").text(section.title, { underline: true });
      doc.moveDown(0.8);
      doc.fontSize(10).fillColor("#222").text(section.body, { align: "left", lineGap: 2 });
    });

    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

async function main() {
  const src = process.env.OPENAI_API_KEY ? "OpenAI" : process.env.GROQ_API_KEY ? "Groq" : "static";
  if (src === "static") {
    console.log("Using static handbook (no OPENAI_API_KEY / GROQ_API_KEY)…");
  } else {
    console.log(`Requesting handbook content from ${src}…`);
  }
  const sections = await fetchHandbookSections();
  console.log(`Writing PDF (${sections.length} sections) to ${outPath}`);
  await writePdf(sections, outPath);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
