import { Injectable } from "@nestjs/common";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { normalizeBdPhone } from "../../common/utils/phone";
import type { CityScope } from "../../generated/prisma/enums";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { toAddressView, type AddressView } from "./address.mapper";
import type { CreateAddressDto } from "./dto/create-address.dto";
import type { UpdateAddressDto } from "./dto/update-address.dto";

const ADDRESS_INCLUDE = {
  district: { select: { id: true, name: true, nameBn: true, division: true } },
  thana: { select: { id: true, name: true, nameBn: true, dhakaZone: true } },
} satisfies Prisma.AddressInclude;

@Injectable()
export class AddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async list(userId: string): Promise<AddressView[]> {
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      include: ADDRESS_INCLUDE,
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return addresses.map(toAddressView);
  }

  async create(userId: string, dto: CreateAddressDto): Promise<AddressView> {
    const cityScope = await this.resolveCityScope(dto.districtId, dto.cityScope);
    const thanaId = await this.resolveThana(dto.districtId, dto.thanaId ?? null);
    const count = await this.prisma.address.count({ where: { userId } });
    const isDefault = dto.isDefault ?? count === 0;

    const address = await this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await this.clearDefault(tx, userId);
      }
      return tx.address.create({
        data: {
          userId,
          label: dto.label ?? null,
          recipientName: dto.recipientName.trim(),
          phone: this.normalizePhone(dto.phone),
          districtId: dto.districtId,
          thanaId,
          cityScope,
          area: dto.area.trim(),
          addressLine: dto.addressLine.trim(),
          postalCode: dto.postalCode ?? null,
          isDefault,
        },
        include: ADDRESS_INCLUDE,
      });
    });
    return toAddressView(address);
  }

  async update(userId: string, id: string, dto: UpdateAddressDto): Promise<AddressView> {
    await this.assertOwned(userId, id);

    const data: Prisma.AddressUpdateInput = {};
    if (
      dto.districtId !== undefined ||
      dto.cityScope !== undefined ||
      dto.thanaId !== undefined
    ) {
      const current = await this.prisma.address.findFirst({
        where: { id, userId },
        select: { districtId: true, thanaId: true },
      });
      if (!current) {
        throw AppException.notFound(ErrorCode.ADDRESS_NOT_FOUND, "Address not found");
      }
      const districtId = dto.districtId ?? current.districtId;
      if (dto.cityScope !== undefined) {
        data.cityScope = await this.resolveCityScope(districtId, dto.cityScope);
      }
      const districtChanged =
        dto.districtId !== undefined && dto.districtId !== current.districtId;
      const requestedThana =
        dto.thanaId !== undefined
          ? dto.thanaId
          : districtChanged
            ? null
            : current.thanaId;
      const thanaId = await this.resolveThana(districtId, requestedThana);
      data.thana = thanaId ? { connect: { id: thanaId } } : { disconnect: true };
    }
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.recipientName !== undefined) data.recipientName = dto.recipientName.trim();
    if (dto.phone !== undefined) data.phone = this.normalizePhone(dto.phone);
    if (dto.districtId !== undefined) data.district = { connect: { id: dto.districtId } };
    if (dto.area !== undefined) data.area = dto.area.trim();
    if (dto.addressLine !== undefined) data.addressLine = dto.addressLine.trim();
    if (dto.postalCode !== undefined) data.postalCode = dto.postalCode;
    if (dto.isDefault !== undefined) data.isDefault = dto.isDefault;

    const address = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await this.clearDefault(tx, userId, id);
      }
      return tx.address.update({ where: { id }, data, include: ADDRESS_INCLUDE });
    });
    return toAddressView(address);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.assertOwned(userId, id);
    await this.prisma.address.delete({ where: { id } });
  }

  async setDefault(userId: string, id: string): Promise<AddressView> {
    await this.assertOwned(userId, id);
    await this.prisma.$transaction(async (tx) => {
      await this.clearDefault(tx, userId, id);
      await tx.address.update({ where: { id }, data: { isDefault: true } });
    });
    const address = await this.prisma.address.findUniqueOrThrow({
      where: { id },
      include: ADDRESS_INCLUDE,
    });
    return toAddressView(address);
  }

  private clearDefault(
    client: Prisma.TransactionClient | PrismaClient,
    userId: string,
    exceptId?: string,
  ): Promise<{ count: number }> {
    return client.address.updateMany({
      where: { userId, isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isDefault: false },
    });
  }

  private async assertOwned(userId: string, id: string): Promise<void> {
    const address = await this.prisma.address.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!address) {
      throw AppException.notFound(ErrorCode.ADDRESS_NOT_FOUND, "Address not found");
    }
  }

  private async resolveCityScope(
    districtId: number,
    requested?: CityScope,
  ): Promise<CityScope> {
    const district = await this.prisma.district.findUnique({
      where: { id: districtId },
      select: { name: true },
    });
    if (!district) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Unknown district");
    }
    const metro = await this.settings.get<string[]>("metroDistricts");
    if (!Array.isArray(metro) || !metro.includes(district.name)) {
      return "NA";
    }
    return requested === "CITY" || requested === "OUTSIDE" ? requested : "NA";
  }

  private async resolveThana(
    districtId: number,
    thanaId: string | null,
  ): Promise<string | null> {
    const district = await this.prisma.district.findUnique({
      where: { id: districtId },
      select: { name: true },
    });
    if (!district) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Unknown district");
    }
    if (thanaId) {
      const thana = await this.prisma.thana.findFirst({
        where: { id: thanaId, districtId, isActive: true },
        select: { id: true },
      });
      if (!thana) {
        throw AppException.badRequest(
          ErrorCode.VALIDATION_FAILED,
          "The selected thana does not belong to this district",
        );
      }
      return thana.id;
    }
    if (district.name === "Dhaka") {
      throw AppException.badRequest(
        ErrorCode.ADDRESS_THANA_REQUIRED,
        "Choose a thana for a Dhaka address",
      );
    }
    return null;
  }

  private normalizePhone(phone: string): string {
    try {
      return normalizeBdPhone(phone);
    } catch {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Invalid phone number");
    }
  }
}

