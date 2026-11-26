import { Injectable } from "@nestjs/common";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { decryptAesGcm, encryptAesGcm } from "../../common/utils/crypto";
import { normalizeBdPhone } from "../../common/utils/phone";
import { payoutDestinationError } from "../../common/validators/payout-destination";
import { AppConfigService } from "../../config/app-config.service";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { AddDocumentDto } from "./dto/add-document.dto";
import type { CreatePayoutAccountDto } from "./dto/create-payout-account.dto";
import type { UpdateApplicationDto } from "./dto/update-application.dto";
import { SellerContextService } from "./seller-context.service";

@Injectable()
export class SellersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly sellerContext: SellerContextService,
    private readonly notifications: NotificationsService,
  ) {}

  async getApplication(userId: string) {
    const profile = await this.sellerContext.requireProfile(userId);
    return {
      id: profile.id,
      sellerType: profile.sellerType,
      businessName: profile.businessName,
      contactPhone: profile.contactPhone,
      tradeLicenseNo: profile.tradeLicenseNo,
      businessAddress: profile.businessAddress,
      status: profile.status,
      rejectionReason: profile.rejectionReason,
      submittedAt: profile.submittedAt,
      reviewedAt: profile.reviewedAt,
      verifiedAt: profile.verifiedAt,
      documents: profile.documents,
      shop: profile.shops[0]
        ? {
            id: profile.shops[0].id,
            name: profile.shops[0].name,
            slug: profile.shops[0].slug,
            status: profile.shops[0].status,
          }
        : null,
    };
  }

  async updateApplication(userId: string, dto: UpdateApplicationDto) {
    const profile = await this.sellerContext.requireProfile(userId);
    const data: Prisma.SellerProfileUpdateInput = {};
    if (dto.businessName !== undefined) data.businessName = dto.businessName.trim();
    if (dto.sellerType !== undefined) data.sellerType = dto.sellerType;
    if (dto.contactPhone !== undefined) data.contactPhone = this.normalizePhone(dto.contactPhone);
    if (dto.businessAddress !== undefined) data.businessAddress = dto.businessAddress.trim();
    if (dto.tradeLicenseNo !== undefined) data.tradeLicenseNo = dto.tradeLicenseNo;

    await this.prisma.sellerProfile.update({ where: { id: profile.id }, data });
    return this.getApplication(userId);
  }

  async addDocument(userId: string, dto: AddDocumentDto) {
    const profile = await this.sellerContext.requireProfile(userId);
    if (profile.status === "APPROVED") {
      throw AppException.conflict(
        ErrorCode.CONFLICT,
        "Approved sellers cannot change onboarding documents",
      );
    }
    return this.prisma.sellerDocument.create({
      data: { sellerProfileId: profile.id, type: dto.type, fileKey: dto.fileKey },
    });
  }

  async removeDocument(userId: string, documentId: string): Promise<void> {
    const profile = await this.sellerContext.requireProfile(userId);
    const document = await this.prisma.sellerDocument.findFirst({
      where: { id: documentId, sellerProfileId: profile.id },
      select: { id: true },
    });
    if (!document) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Document not found");
    }
    await this.prisma.sellerDocument.delete({ where: { id: documentId } });
  }

  async submitApplication(userId: string) {
    const profile = await this.sellerContext.requireProfile(userId);

    if (profile.status === "PENDING") {
      throw AppException.conflict(
        ErrorCode.SELLER_APPLICATION_ALREADY_SUBMITTED,
        "Your application is already under review",
      );
    }
    if (profile.status === "APPROVED" || profile.status === "SUSPENDED") {
      throw AppException.conflict(
        ErrorCode.CONFLICT,
        "Your seller account is not in a submittable state",
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true },
    });
    if (!user?.emailVerifiedAt) {
      throw AppException.forbidden(
        ErrorCode.EMAIL_NOT_VERIFIED,
        "Verify your email before submitting",
      );
    }

    const shop = profile.shops[0];
    const zoneCount = shop
      ? await this.prisma.shopDeliveryZone.count({ where: { shopId: shop.id, isActive: true } })
      : 0;
    const conditionCount = shop
      ? await this.prisma.shopDeliveryZone.count({
          where: { shopId: shop.id, isActive: true, condition: { not: null } },
        })
      : 0;

    const missing: string[] = [];
    if (profile.businessName.trim().length === 0) missing.push("businessName");
    if (profile.contactPhone.trim().length === 0) missing.push("contactPhone");
    if (profile.businessAddress.trim().length === 0) missing.push("businessAddress");
    if (profile.documents.length === 0) missing.push("documents");
    if (!shop) missing.push("shop");
    if (zoneCount === 0 || (conditionCount > 0 && conditionCount < 2))
      missing.push("deliveryZone");

    if (missing.length > 0) {
      throw AppException.unprocessable(
        ErrorCode.SELLER_APPLICATION_INCOMPLETE,
        "Your application is incomplete",
        missing,
      );
    }

    const now = new Date();
    await this.prisma.sellerProfile.update({
      where: { id: profile.id },
      data: { status: "PENDING", submittedAt: now, rejectionReason: null },
    });

    await this.notifications.createForAdmins({
      type: "SYSTEM",
      title: "New seller application",
      body: `${profile.businessName} submitted a seller application for review.`,
      data: { sellerProfileId: profile.id },
    });

    return this.getApplication(userId);
  }

  async listPayoutAccounts(userId: string) {
    const profile = await this.sellerContext.requireProfile(userId);
    const accounts = await this.prisma.sellerPayoutAccount.findMany({
      where: { sellerProfileId: profile.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return accounts.map((account) => this.toPayoutAccountView(account));
  }

  async createPayoutAccount(userId: string, dto: CreatePayoutAccountDto) {
    const profile = await this.sellerContext.requireProfile(userId);
    const invalid = payoutDestinationError(dto.method, dto.accountNumber);
    if (invalid) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, invalid, {
        accountNumber: invalid,
      });
    }
    const normalized =
      dto.method === "BANK" ? dto.accountNumber.trim() : normalizeBdPhone(dto.accountNumber);
    const accountNumberEnc = encryptAesGcm(
      normalized,
      this.config.values.DATA_ENCRYPTION_KEY,
    );
    const accountMasked = maskAccountNumber(normalized);
    const isDefault = dto.isDefault ?? false;

    const account = await this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.sellerPayoutAccount.updateMany({
          where: { sellerProfileId: profile.id, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.sellerPayoutAccount.create({
        data: {
          sellerProfileId: profile.id,
          method: dto.method,
          accountName: dto.accountName.trim(),
          accountNumberEnc,
          accountMasked,
          isDefault,
        },
      });
    });
    return this.toPayoutAccountView(account);
  }

  async removePayoutAccount(userId: string, accountId: string): Promise<void> {
    const profile = await this.sellerContext.requireProfile(userId);
    const account = await this.prisma.sellerPayoutAccount.findFirst({
      where: { id: accountId, sellerProfileId: profile.id },
      select: { id: true },
    });
    if (!account) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Payout account not found");
    }
    await this.prisma.sellerPayoutAccount.delete({ where: { id: accountId } });
  }

  private toPayoutAccountView(account: {
    id: string;
    method: string;
    accountName: string;
    accountNumberEnc: string;
    accountMasked: string;
    isDefault: boolean;
    createdAt: Date;
  }) {
    let needsUpdate: boolean;
    try {
      const number = decryptAesGcm(account.accountNumberEnc, this.config.values.DATA_ENCRYPTION_KEY);
      needsUpdate = payoutDestinationError(account.method, number) !== null;
    } catch {
      needsUpdate = true;
    }
    return {
      id: account.id,
      method: account.method,
      accountName: account.accountName,
      accountMasked: account.accountMasked,
      isDefault: account.isDefault,
      createdAt: account.createdAt,
      needsUpdate,
    };
  }

  private normalizePhone(phone: string): string {
    try {
      return normalizeBdPhone(phone);
    } catch {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Invalid phone number");
    }
  }
}

function maskAccountNumber(accountNumber: string): string {
  const cleaned = accountNumber.replace(/\s+/g, "");
  if (cleaned.length <= 4) {
    return `****${cleaned}`;
  }
  return `****${cleaned.slice(-4)}`;
}
