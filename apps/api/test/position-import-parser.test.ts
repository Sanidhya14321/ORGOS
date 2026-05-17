import test from "node:test";
import assert from "node:assert/strict";
import { parsePositionImportPreview } from "../src/services/positionImportParser.js";

test("parsePositionImportPreview maps visibility_scope Team to department", async () => {
  const csv = [
    "title,department,visibility_scope,email_prefix",
    "Engineering Manager,Engineering,Team,eng-manager"
  ].join("\n");

  const preview = await parsePositionImportPreview({
    buffer: Buffer.from(csv, "utf8"),
    fileName: "positions.csv",
    mimeType: "text/csv"
  });

  assert.equal(preview.positions.length, 1);
  assert.equal(preview.positions[0]?.visibility_scope, "department");
  assert.ok(preview.warnings.some((warning) => warning.includes('Mapped visibility "Team"')));
});
