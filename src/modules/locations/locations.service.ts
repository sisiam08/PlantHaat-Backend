import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  listDistricts() {
    return this.prisma.district.findMany({
      orderBy: [{ division: "asc" }, { name: "asc" }],
      select: { id: true, name: true, nameBn: true, division: true },
    });
  }
}
