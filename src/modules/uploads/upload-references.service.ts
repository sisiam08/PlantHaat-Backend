import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import {
  UPLOAD_JSON_REFERENCES,
  UPLOAD_PRIVATE_REFERENCES,
  UPLOAD_SCALAR_REFERENCES,
  type UploadReference,
} from "./upload-references";

type CountModel = { count(args: unknown): Promise<number> };

@Injectable()
export class UploadReferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the first registry entry that still references `url`. */
  async findReference(url: string): Promise<UploadReference | null> {
    for (const ref of [...UPLOAD_SCALAR_REFERENCES, ...UPLOAD_PRIVATE_REFERENCES]) {
      const model = (this.prisma as unknown as Record<string, CountModel>)[ref.model];
      const count = await model.count({ where: { [ref.column]: url } });
      if (count > 0) return ref;
    }

    for (const ref of UPLOAD_JSON_REFERENCES) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ one: number }>>(
        `SELECT 1 AS one FROM "${ref.table}" WHERE "${ref.column}"::text LIKE '%' || $1 || '%' LIMIT 1`,
        url,
      );
      if (rows.length > 0) return ref;
    }

    return null;
  }
}
