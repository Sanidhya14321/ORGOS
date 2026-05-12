import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "..");

const forbiddenPatterns = [
  { pattern: /\.from\((["'])organizations\1\)|public\.organizations\b/g, label: "legacy organizations table" },
  { pattern: /\.from\((["'])user_profiles\1\)|public\.user_profiles\b/g, label: "legacy user_profiles table" }
];

const targetDirectories = [
  path.join(repoRoot, "apps/api/src"),
  path.join(repoRoot, "packages/db/schema")
];

async function collectFiles(targetDirectory) {
  const entries = await fs.readdir(targetDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(targetDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath)));
      continue;
    }

    if (/\.(ts|sql)$/.test(entry.name)) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function run() {
  const matches = [];

  for (const directory of targetDirectories) {
    const files = await collectFiles(directory);
    for (const filePath of files) {
      const contents = await fs.readFile(filePath, "utf8");
      for (const { pattern, label } of forbiddenPatterns) {
        if (pattern.test(contents)) {
          matches.push(`${label}: ${path.relative(process.cwd(), filePath)}`);
        }
      }
    }
  }

  if (matches.length > 0) {
    console.error("Legacy schema references remain:");
    for (const match of matches) {
      console.error(`- ${match}`);
    }
    process.exit(1);
  }

  console.log("No legacy schema references found");
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
