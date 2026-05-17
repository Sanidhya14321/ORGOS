import path from "node:path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";
import type { z } from "zod";
import { DocumentSourceFormatSchema } from "@orgos/shared-types";

export type SupportedSourceFormat = z.infer<typeof DocumentSourceFormatSchema>;

/** Cap tabular row expansion so XLSX/CSV do not explode past document char limits. */
const MAX_TABULAR_ROWS_PER_SHEET = Math.max(
  500,
  Number.parseInt(process.env.DOCUMENT_MAX_TABULAR_ROWS_PER_SHEET ?? "8000", 10) || 8000
);

export interface ParsedTable {
  name: string;
  headers: string[];
  rows: Array<Record<string, string>>;
}

export interface ParsedPdfPage {
  pageNumber: number;
  text: string;
}

export interface ParsedLocalFile {
  text: string;
  sourceFormat: SupportedSourceFormat;
  mimeType: string;
  detectedHeaders: string[];
  warnings: string[];
  tables: ParsedTable[];
  /** Per-page text when source is PDF (1-based page numbers). */
  pdfPages?: ParsedPdfPage[];
  /** Total pages in PDF per parser (includes empty pages). */
  pdfTotalPages?: number;
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slugLike(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function inferSourceFormat(fileName: string, mimeType?: string | null): SupportedSourceFormat {
  const extension = path.extname(fileName).toLowerCase();
  const normalizedMime = (mimeType ?? "").toLowerCase();

  if (extension === ".pdf" || normalizedMime.includes("pdf")) {
    return "pdf";
  }
  if (extension === ".docx" || normalizedMime.includes("wordprocessingml")) {
    return "docx";
  }
  if (extension === ".xlsx" || normalizedMime.includes("spreadsheetml")) {
    return "xlsx";
  }
  if (extension === ".csv" || normalizedMime.includes("csv")) {
    return "csv";
  }
  if (extension === ".md" || normalizedMime.includes("markdown")) {
    return "md";
  }
  if (
    extension === ".txt" ||
    normalizedMime.startsWith("text/") ||
    normalizedMime.includes("json")
  ) {
    return "txt";
  }
  return "unknown";
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return JSON.stringify(value);
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(content: string): ParsedTable {
  const lines = normalizeWhitespace(content)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { name: "Sheet1", headers: [], rows: [] };
  }

  const headerRow = splitCsvLine(lines[0] ?? "");
  const headers = headerRow.map((header, index) => header || `column_${index + 1}`);
  const rows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = values[index] ?? "";
      return record;
    }, {});
  });

  return {
    name: "Sheet1",
    headers,
    rows
  };
}

function workbookToTables(buffer: Buffer): ParsedTable[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return {
        name: sheetName,
        headers: [],
        rows: []
      };
    }
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false
    });
    const headers = Array.from(
      new Set(rawRows.flatMap((row) => Object.keys(row).map((key) => key.trim()).filter(Boolean)))
    );
    const rows = rawRows.map((row) =>
      headers.reduce<Record<string, string>>((record, header) => {
        record[header] = stringifyCell(row[header]);
        return record;
      }, {})
    );
    return {
      name: sheetName,
      headers,
      rows
    };
  });
}

function renderTablesToText(tables: ParsedTable[], warnings: string[]): string {
  return tables
    .map((table) => {
      const lines = [`# Sheet: ${table.name}`];
      if (table.headers.length > 0) {
        lines.push(table.headers.join(" | "));
      }
      let rows = table.rows;
      if (rows.length > MAX_TABULAR_ROWS_PER_SHEET) {
        warnings.push(
          `Sheet "${table.name}" truncated to ${MAX_TABULAR_ROWS_PER_SHEET.toLocaleString()} rows (${rows.length.toLocaleString()} in file). Split large spreadsheets or upload a smaller export.`
        );
        rows = rows.slice(0, MAX_TABULAR_ROWS_PER_SHEET);
      }
      for (const row of rows) {
        lines.push(table.headers.map((header) => row[header] ?? "").join(" | "));
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

function fallbackTableFromText(text: string): ParsedTable[] {
  const lines = normalizeWhitespace(text).split("\n").map((line) => line.trim()).filter(Boolean);
  const delimiter = lines.find((line) => /[,\t|;]/.test(line));
  if (!delimiter) {
    return [];
  }

  const separator = delimiter.includes("\t")
    ? "\t"
    : delimiter.includes("|")
      ? "|"
      : delimiter.includes(";")
        ? ";"
        : ",";
  const headers = delimiter
    .split(separator)
    .map((header, index) => header.trim() || `column_${index + 1}`);

  const rows = lines
    .slice(lines.indexOf(delimiter) + 1)
    .map((line) => line.split(separator).map((value) => value.trim()))
    .filter((values) => values.some(Boolean))
    .map((values) =>
      headers.reduce<Record<string, string>>((record, header, index) => {
        record[header] = values[index] ?? "";
        return record;
      }, {})
    );

  return headers.length > 1 ? [{ name: "Sheet1", headers, rows }] : [];
}

function collectDetectedHeaders(tables: ParsedTable[]): string[] {
  return Array.from(
    new Set(
      tables.flatMap((table) =>
        table.headers.map((header) => slugLike(header)).filter((header) => header.length > 0)
      )
    )
  );
}

export async function parseLocalFile(params: {
  buffer: Buffer;
  fileName: string;
  mimeType?: string | null;
}): Promise<ParsedLocalFile> {
  const sourceFormat = inferSourceFormat(params.fileName, params.mimeType);
  const warnings: string[] = [];
  let text = "";
  let tables: ParsedTable[] = [];

  switch (sourceFormat) {
    case "pdf": {
      const parser = new PDFParse({ data: params.buffer });
      const result = await parser.getText();
      text = result.text ?? "";
      const total = typeof result.total === "number" ? result.total : 0;
      const pagesRaw = Array.isArray(result.pages) ? result.pages : [];
      const pdfPages: ParsedPdfPage[] = pagesRaw
        .map((page: { num?: number; text?: string }) => ({
          pageNumber: typeof page.num === "number" ? page.num : 0,
          text: normalizeWhitespace(page.text ?? "")
        }))
        .filter((page) => page.pageNumber > 0);

      await parser.destroy();

      return {
        text: normalizeWhitespace(text),
        sourceFormat,
        mimeType: params.mimeType?.trim() || "application/octet-stream",
        detectedHeaders: collectDetectedHeaders(tables),
        warnings,
        tables,
        pdfPages,
        pdfTotalPages: total > 0 ? total : pdfPages.length
      };
    }
    case "docx": {
      const result = await mammoth.extractRawText({ buffer: params.buffer });
      text = result.value ?? "";
      warnings.push(...(result.messages ?? []).map((message) => message.message));
      break;
    }
    case "xlsx": {
      tables = workbookToTables(params.buffer);
      text = renderTablesToText(tables, warnings);
      break;
    }
    case "csv": {
      const csvText = params.buffer.toString("utf8");
      tables = [parseCsv(csvText)];
      text = renderTablesToText(tables, warnings);
      break;
    }
    case "md":
    case "txt":
    case "unknown":
    default: {
      text = params.buffer.toString("utf8");
      break;
    }
  }

  const normalizedText = normalizeWhitespace(text);
  if (tables.length === 0 && normalizedText.length > 0) {
    tables = fallbackTableFromText(normalizedText);
  }

  return {
    text: normalizedText,
    sourceFormat,
    mimeType: params.mimeType?.trim() || "application/octet-stream",
    detectedHeaders: collectDetectedHeaders(tables),
    warnings,
    tables
  };
}
