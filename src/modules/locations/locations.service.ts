import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async listDistricts() {
    const [districts, metro] = await Promise.all([
      this.prisma.district.findMany({
        orderBy: [{ division: "asc" }, { name: "asc" }],
        select: { id: true, name: true, nameBn: true, division: true },
      }),
      this.settings.get<string[]>("metroDistricts"),
    ]);
    const metroNames = Array.isArray(metro) ? metro : [];
    return districts.map((district) => ({
      ...district,
      metro: metroNames.includes(district.name),
    }));
  }
}
