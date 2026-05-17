import type { z } from "zod";
import {
  OnboardingBranchInputSchema,
  OnboardingPositionInputSchema,
  OnboardingPositionParsePreviewResponseSchema
} from "@orgos/shared-types";
import { parseLocalFile } from "./localFileParser.js";

type ParsedBranch = z.infer<typeof OnboardingBranchInputSchema>;
type ParsedPosition = z.infer<typeof OnboardingPositionInputSchema>;
type PositionParsePreview = z.infer<typeof OnboardingPositionParsePreviewResponseSchema>;

const HEADER_ALIASES = {
  title: ["title", "position", "position_title", "role", "designation", "job_title"],
  department: ["department", "function", "team", "business_unit"],
  branch_code: ["branch_code", "branch", "office_code", "location_code", "branch id"],
  branch_name: ["branch_name", "branch_title", "office", "location", "site"],
  level: ["level", "position_level", "grade", "hierarchy_level", "layer"],
  power_level: ["power_level", "power", "authority"],
  reports_to_title: ["reports_to_title", "reports_to", "manager", "manager_title", "supervisor", "reports to"],
  email_prefix: ["email_prefix", "username", "login", "alias", "seat_email_prefix"],
  invite_email: ["invite_email", "email", "work_email"],
  seat_label: ["seat_label", "seat", "position_label"],
  visibility_scope: ["visibility_scope", "visibility"],
  max_concurrent_tasks: ["max_concurrent_tasks", "max_tasks", "task_limit"],
  branch_code_only: ["code", "branch_code", "office_code"],
  branch_name_only: ["name", "branch_name", "office_name", "location_name"],
  city: ["city"],
  country: ["country"],
  timezone: ["timezone", "time_zone"],
  is_headquarters: ["is_headquarters", "headquarters", "hq"]
} as const;

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "seat";
}

function inferLevelFromTitle(title: string): number {
  const normalized = title.toLowerCase();
  if (normalized.includes("chief executive") || normalized === "ceo" || normalized === "cfo" || normalized.includes("chief financial")) {
    return 0;
  }
  if (normalized.includes("vp") || normalized.includes("vice president") || normalized.includes("head")) {
    return 1;
  }
  if (normalized.includes("director")) {
    return 2;
  }
  if (normalized.includes("manager")) {
    return 3;
  }
  if (normalized.includes("lead")) {
    return 4;
  }
  return 5;
}

const VALID_VISIBILITY_SCOPES = ["org", "branch", "department", "subtree", "self"] as const;
type VisibilityScope = (typeof VALID_VISIBILITY_SCOPES)[number];

const VISIBILITY_SCOPE_ALIASES: Record<string, VisibilityScope> = {
  org: "org",
  organization: "org",
  organisation: "org",
  company: "org",
  entire_org: "org",
  branch: "branch",
  office: "branch",
  location: "branch",
  department: "department",
  dept: "department",
  team: "department",
  subtree: "subtree",
  tree: "subtree",
  default: "subtree",
  self: "self",
  individual: "self",
  personal: "self"
};

function boolFromValue(value: string): boolean {
  return ["true", "1", "yes", "y"].includes(value.trim().toLowerCase());
}

function normalizeVisibilityScope(raw: string | undefined, warnings: string[], title: string): VisibilityScope {
  if (!raw) {
    return "subtree";
  }

  const key = normalizeKey(raw);
  const mapped = VISIBILITY_SCOPE_ALIASES[key];
  if (mapped) {
    if (key !== mapped && !VALID_VISIBILITY_SCOPES.includes(key as VisibilityScope)) {
      warnings.push(`Mapped visibility "${raw}" to "${mapped}" for "${title}"`);
    }
    return mapped;
  }

  if (VALID_VISIBILITY_SCOPES.includes(key as VisibilityScope)) {
    return key as VisibilityScope;
  }

  warnings.push(`Unknown visibility "${raw}" for "${title}"; using subtree`);
  return "subtree";
}

function parsePositiveInt(raw: string | undefined, warnings: string[], title: string, field: string): number | undefined {
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }

  warnings.push(`Ignored invalid ${field} "${raw}" for "${title}"`);
  return undefined;
}

function lookupValue(row: Record<string, string>, aliases: readonly string[]): string | undefined {
  for (const alias of aliases) {
    const value = row[alias];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeRow(row: Record<string, string>): Record<string, string> {
  return Object.entries(row).reduce<Record<string, string>>((record, [key, value]) => {
    record[normalizeKey(key)] = typeof value === "string" ? value.trim() : "";
    return record;
  }, {});
}

function isBranchTable(headers: string[]): boolean {
  const headerSet = new Set(headers.map(normalizeKey));
  return (
    (headerSet.has("branch_code") || headerSet.has("office_code") || headerSet.has("code")) &&
    (headerSet.has("branch_name") || headerSet.has("name") || headerSet.has("office_name") || headerSet.has("location_name")) &&
    !headerSet.has("title") &&
    !headerSet.has("position")
  );
}

function parseBranchRow(row: Record<string, string>): ParsedBranch | null {
  const code = lookupValue(row, HEADER_ALIASES.branch_code_only);
  const name = lookupValue(row, HEADER_ALIASES.branch_name_only);
  if (!code || !name) {
    return null;
  }

  return {
    code,
    name,
    city: lookupValue(row, HEADER_ALIASES.city),
    country: lookupValue(row, HEADER_ALIASES.country),
    timezone: lookupValue(row, HEADER_ALIASES.timezone),
    is_headquarters: boolFromValue(lookupValue(row, HEADER_ALIASES.is_headquarters) ?? "false")
  };
}

function parsePositionRow(row: Record<string, string>, warnings: string[]): ParsedPosition | null {
  const title = lookupValue(row, HEADER_ALIASES.title);
  if (!title) {
    return null;
  }

  const rawLevel = lookupValue(row, HEADER_ALIASES.level);
  const inferredLevel = inferLevelFromTitle(title);
  const parsedLevel = rawLevel && /^-?\d+$/.test(rawLevel) ? Number(rawLevel) : inferredLevel;
  if (!rawLevel) {
    warnings.push(`Inferred level ${parsedLevel} for "${title}"`);
  }

  const rawPowerLevel = lookupValue(row, HEADER_ALIASES.power_level);
  const powerLevel = rawPowerLevel && /^-?\d+$/.test(rawPowerLevel) ? Number(rawPowerLevel) : undefined;
  const emailPrefix = lookupValue(row, HEADER_ALIASES.email_prefix) ?? slugify(title);

  return {
    title,
    department: lookupValue(row, HEADER_ALIASES.department),
    branch_code: lookupValue(row, HEADER_ALIASES.branch_code),
    level: parsedLevel,
    power_level: powerLevel,
    reports_to_title: lookupValue(row, HEADER_ALIASES.reports_to_title),
    visibility_scope: normalizeVisibilityScope(lookupValue(row, HEADER_ALIASES.visibility_scope), warnings, title),
    email_prefix: emailPrefix,
    invite_email: lookupValue(row, HEADER_ALIASES.invite_email),
    issue_mode: "hybrid",
    seat_label: lookupValue(row, HEADER_ALIASES.seat_label),
    max_concurrent_tasks: parsePositiveInt(
      lookupValue(row, HEADER_ALIASES.max_concurrent_tasks),
      warnings,
      title,
      "max_concurrent_tasks"
    )
  };
}

function parseKeyValueBlocks(text: string): Array<Record<string, string>> {
  return text
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    )
    .filter((lines) => lines.some((line) => line.includes(":")))
    .map((lines) =>
      lines.reduce<Record<string, string>>((record, line) => {
        const separatorIndex = line.indexOf(":");
        if (separatorIndex <= 0) {
          return record;
        }
        const key = normalizeKey(line.slice(0, separatorIndex));
        const value = line.slice(separatorIndex + 1).trim();
        if (key && value) {
          record[key] = value;
        }
        return record;
      }, {})
    )
    .filter((record) => Object.keys(record).length > 0);
}

function parseLineTable(text: string): Array<Record<string, string>> {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const separatorLine = lines.find((line) => line.includes("|"));
  if (!separatorLine) {
    return [];
  }

  const headers = separatorLine.split("|").map((header) => normalizeKey(header));
  return lines
    .slice(lines.indexOf(separatorLine) + 1)
    .map((line) => line.split("|").map((value) => value.trim()))
    .filter((values) => values.some(Boolean))
    .map((values) =>
      headers.reduce<Record<string, string>>((record, header, index) => {
        if (header) {
          record[header] = values[index] ?? "";
        }
        return record;
      }, {})
    );
}

function detectCycles(positions: ParsedPosition[], warnings: string[]): void {
  const parentByTitle = new Map(
    positions
      .filter((position) => position.reports_to_title)
      .map((position) => [position.title.toLowerCase(), position.reports_to_title!.toLowerCase()])
  );

  for (const position of positions) {
    const visited = new Set<string>();
    let current = position.title.toLowerCase();
    while (parentByTitle.has(current)) {
      if (visited.has(current)) {
        warnings.push(`Detected reporting cycle involving "${position.title}"`);
        break;
      }
      visited.add(current);
      current = parentByTitle.get(current) ?? "";
    }
  }
}

function buildWarnings(branches: ParsedBranch[], positions: ParsedPosition[]): string[] {
  const warnings: string[] = [];
  const seenTitles = new Set<string>();
  const branchCodes = new Set(branches.map((branch) => branch.code.toLowerCase()));

  for (const position of positions) {
    const titleKey = position.title.toLowerCase();
    if (seenTitles.has(titleKey)) {
      warnings.push(`Duplicate position title "${position.title}"`);
    }
    seenTitles.add(titleKey);

    if (position.branch_code && branchCodes.size > 0 && !branchCodes.has(position.branch_code.toLowerCase())) {
      warnings.push(`Unknown branch code "${position.branch_code}" for "${position.title}"`);
    }
  }

  detectCycles(positions, warnings);
  return warnings;
}

export async function parsePositionImportPreview(params: {
  buffer: Buffer;
  fileName: string;
  mimeType?: string | null;
}): Promise<PositionParsePreview> {
  const parsedFile = await parseLocalFile(params);
  const warnings = [...parsedFile.warnings];
  const branches: ParsedBranch[] = [];
  const positions: ParsedPosition[] = [];

  for (const table of parsedFile.tables) {
    const normalizedRows = table.rows.map(normalizeRow);
    if (isBranchTable(table.headers)) {
      for (const row of normalizedRows) {
        const branch = parseBranchRow(row);
        if (branch) {
          branches.push(branch);
        }
      }
      continue;
    }

    for (const row of normalizedRows) {
      const position = parsePositionRow(row, warnings);
      if (position) {
        positions.push(position);
      }
    }
  }

  if (positions.length === 0) {
    const blockRows = [...parseKeyValueBlocks(parsedFile.text), ...parseLineTable(parsedFile.text)].map(normalizeRow);
    for (const row of blockRows) {
      const branch = parseBranchRow(row);
      if (branch) {
        branches.push(branch);
      }
      const position = parsePositionRow(row, warnings);
      if (position) {
        positions.push(position);
      }
    }
  }

  const qualityWarnings = buildWarnings(branches, positions);
  warnings.push(...qualityWarnings);

  return {
    import_source: "file",
    source_format: parsedFile.sourceFormat,
    branches,
    positions,
    warnings: Array.from(new Set(warnings)),
    detected_headers: parsedFile.detectedHeaders,
    stats: {
      branch_count: branches.length,
      position_count: positions.length
    }
  };
}
