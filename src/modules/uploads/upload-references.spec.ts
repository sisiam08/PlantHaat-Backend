import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  UPLOAD_JSON_REFERENCES,
  UPLOAD_PRIVATE_REFERENCES,
  UPLOAD_SCALAR_REFERENCES,
  UPLOAD_SELF_TABLE,
  URL_LIKE_COLUMNS,
} from "./upload-references";

interface Field {
  model: string;
  table: string;
  name: string;
  type: string;
}

function schemaFields(): Field[] {
  const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
  const fields: Field[] = [];
  for (const match of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const model = match[1];
    const body = match[2];
    for (const line of body.split(/\r?\n/)) {
      const field = /^\s*(\w+)\s+([A-Za-z][\w[\]]*\??)/.exec(line);
      if (!field) continue;
      fields.push({ model, table: model, name: field[1], type: field[2] });
    }
  }
  return fields;
}

describe("upload reference registry", () => {
  const fields = schemaFields();
  const registered = new Set(
    [...UPLOAD_SCALAR_REFERENCES, ...UPLOAD_JSON_REFERENCES, ...UPLOAD_PRIVATE_REFERENCES].map(
      (ref) => `${ref.table}.${ref.column}`,
    ),
  );

  it("registers every URL-like column", () => {
    const missing = fields
      .filter((field) => field.table !== UPLOAD_SELF_TABLE)
      .filter((field) => URL_LIKE_COLUMNS.has(field.name.toLowerCase()))
      .filter((field) => !registered.has(`${field.table}.${field.name}`))
      .map((field) => `${field.table}.${field.name}`);
    expect(missing).toEqual([]);
  });

  it("registers every JSON column", () => {
    const missing = fields
      .filter((field) => field.type.startsWith("Json"))
      .filter((field) => !registered.has(`${field.table}.${field.name}`))
      .map((field) => `${field.table}.${field.name}`);
    expect(missing).toEqual([]);
  });

  it("has no duplicate registry entries", () => {
    const all = [
      ...UPLOAD_SCALAR_REFERENCES,
      ...UPLOAD_JSON_REFERENCES,
      ...UPLOAD_PRIVATE_REFERENCES,
    ].map((ref) => `${ref.table}.${ref.column}`);
    expect(new Set(all).size).toBe(all.length);
  });
});
