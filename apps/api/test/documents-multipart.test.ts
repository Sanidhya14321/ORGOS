import test from "node:test";
import assert from "node:assert/strict";
import multipart from "@fastify/multipart";
import * as XLSX from "xlsx";
import documentsRoutes from "../src/routes/documents.js";
import { buildRouteTestApp, createSupabaseMock, type QueryOperation } from "./helpers/mockBackend.js";

const ownerId = "10000000-0000-0000-0000-000000000001";
const orgId = "10000000-0000-0000-0000-000000000002";
const documentId = "10000000-0000-0000-0000-000000000003";

/** Minimal DOCX (Hello Docx Smoke) — valid OOXML zip. */
const MINIMAL_DOCX_BASE64 =
  "UEsDBBQAAAAIALmorVwXmADX6wAAALIBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU4DMQy98xWRr2gmAweEUKc9sByBQ/kAK/HMRM2mOC3t3+NpoQdUONpvs99itQ9e7aiwS7GHm7YDRdEk6+LYw8f6pbkHxRWjRZ8i9XAghtXyarE+ZGIl4sg9TLXmB63ZTBSQ25QpCjKkErDKWEad0WxwJH3bdXfapFgp1qbOHiBmTzTg1lf1vJf96ZJCnkE9nphzWA+Ys3cGq+B6F+2vmOY7ohXlkcOTy3wtBNCXI2bo74Qf4ZuUU5wl9Y6lvmIQmv5MxWqbzDaItP3f58KlaRicobN+dsslGWKW1oNvz0hAF88f6GPlyy9QSwMEFAAAAAgAuaitXD+t/vqvAAAALAEAAAsAAABfcmVscy8ucmVsc43POw7CMAwA0J1TRN5pWgaEUEMXhNQVlQNEiZtWNB/F4dPbk4EBKgZG/57tunnaid0x0uidgKoogaFTXo/OCLh0p/UOGCXptJy8QwEzEjSHVX3GSaY8Q8MYiGXEkYAhpbDnnNSAVlLhA7pc6X20MuUwGh6kukqDfFOWWx4/DVigrNUCYqsrYN0c8B/c9/2o8OjVzaJLP3YsOrIso8Ek4OGj5vqdLjILPJ/Dv548vABQSwMEFAAAAAgAuaitXFVgQh2nAAAA3AAAABEAAAB3b3JkL2RvY3VtZW50LnhtbDWOPQ7CMAyF954iyk5TGBCq+rMgxA4cICSmrUjsKAm0vT1JJZbv2X7ys5t+sYZ9wYeJsOX7suIMUJGecGj5437ZnTgLUaKWhhBavkLgfVc0c61JfSxgZCkBQz23fIzR1UIENYKVoSQHmLwXeStjav0gZvLaeVIQQjpgjThU1VFYOSHfMp+k1y6py/AZsbuCMcTOpBZ2s/SGRuRppt/oNm6bRa7+f3U/UEsBAhQDFAAAAAgAuaitXBeYANfrAAAAsgEAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAMUAAAACAC5qK1cP63++q8AAAAsAQAACwAAAAAAAAAAAAAAgAEcAQAAX3JlbHMvLnJlbHNQSwECFAMUAAAACAC5qK1cVWBCHacAAADcAAAAEQAAAAAAAAAAAAAAgAH0AQAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAMAAwC5AAAAygIAAAAA";

const MINIMAL_PDF = Buffer.from(
  [
    "%PDF-1.1",
    "1 0 obj<<>>endobj",
    "2 0 obj<</Length 3>>stream",
    "BT /F1 24 Tf 72 720 Td (Hi) Tj ET",
    "endstream endobj",
    "3 0 obj<</Type/Page/Parent 4 0 R/MediaBox[0 0 612 792]/Contents 2 0 R>>endobj",
    "4 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "5 0 obj<</Type/Catalog/Pages 4 0 R>>endobj",
    "xref",
    "0 6",
    "0000000000 65535 f ",
    "0000000009 00000 n ",
    "0000000052 00000 n ",
    "0000000101 00000 n ",
    "0000000190 00000 n ",
    "0000000255 00000 n ",
    "trailer<</Size 6/Root 5 0 R>>",
    "startxref",
    "310",
    "%%EOF"
  ].join("\n"),
  "utf8"
);

function createDocumentsResolver() {
  return async (operation: QueryOperation) => {
    if (operation.table === "orgs" && operation.action === "select") {
      return { data: { id: orgId } };
    }

    if (operation.table === "org_documents" && operation.action === "insert") {
      return { data: { id: documentId } };
    }

    if (operation.table === "org_documents" && operation.action === "update") {
      return { data: { id: documentId } };
    }

    if (operation.table === "org_document_sections" && operation.action === "delete") {
      return { data: null };
    }

    if (operation.table === "org_document_sections" && operation.action === "insert") {
      return { data: [{ id: "10000000-0000-0000-0000-000000000010" }] };
    }

    return { data: null };
  };
}

function buildMultipartBody(
  fields: Record<string, string>,
  file: { fieldname: string; filename: string; contentType: string; buffer: Buffer }
): { body: Buffer; contentType: string } {
  const boundary = `----testboundary${Date.now().toString(36)}`;
  const parts: Buffer[] = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        "utf8"
      )
    );
  }

  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      "utf8"
    )
  );
  parts.push(file.buffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"));

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

function makeXlsxBuffer(): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Role", "Note"],
    ["Engineer", "Multipart smoke xlsx"]
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function injectMultipartUpload(
  app: Awaited<ReturnType<typeof buildRouteTestApp>>,
  file: { fieldname: string; filename: string; contentType: string; buffer: Buffer }
) {
  const { body, contentType } = buildMultipartBody(
    {
      org_id: orgId,
      doc_type: "process",
      retrieval_mode: "vectorless"
    },
    file
  );

  return app.inject({
    method: "POST",
    url: "/documents/upload",
    headers: { "content-type": contentType },
    payload: body
  });
}

test("multipart document upload parses xlsx, docx, and pdf", async () => {
  const supabase = createSupabaseMock({
    resolve: createDocumentsResolver()
  });

  const app = await buildRouteTestApp({
    routes: documentsRoutes,
    supabaseService: supabase.client,
    currentUser: {
      id: ownerId,
      role: "ceo",
      email: "owner@orgos.test"
    },
    beforeRoutes: async (instance) => {
      await instance.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
    }
  });

  const cases = [
    {
      label: "xlsx",
      file: {
        fieldname: "file",
        filename: "smoke-upload.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: makeXlsxBuffer()
      },
      expectedFormat: "xlsx"
    },
    {
      label: "docx",
      file: {
        fieldname: "file",
        filename: "smoke-upload.docx",
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: Buffer.from(MINIMAL_DOCX_BASE64, "base64")
      },
      expectedFormat: "docx"
    },
    {
      label: "pdf",
      file: {
        fieldname: "file",
        filename: "smoke-upload.pdf",
        contentType: "application/pdf",
        buffer: MINIMAL_PDF
      },
      expectedFormat: "pdf"
    }
  ] as const;

  for (const { label, file, expectedFormat } of cases) {
    const response = await injectMultipartUpload(app, file);
    assert.equal(response.statusCode, 201, `${label}: ${response.body}`);

    const documentInsert = supabase.operations
      .filter((operation) => operation.table === "org_documents" && operation.action === "insert")
      .reverse()
      .find((operation) => (operation.values as { file_name?: string }).file_name?.includes(label));

    assert.ok(documentInsert, `${label}: org_documents insert`);
    assert.equal(
      (documentInsert.values as { source_format: string }).source_format,
      expectedFormat,
      `${label}: source_format`
    );
  }
});
