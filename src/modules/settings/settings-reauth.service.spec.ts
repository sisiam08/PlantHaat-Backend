import { jest } from "@jest/globals";
import { hashPassword } from "../../common/utils/password";
import type { PrismaService } from "../../prisma/prisma.service";
import { SettingsReauthService } from "./settings-reauth.service";

async function setup() {
  const hash = await hashPassword("CorrectPass1");
  const prisma = {
    user: { findUnique: jest.fn(async () => ({ passwordHash: hash })) },
  } as unknown as PrismaService;
  return { service: new SettingsReauthService(prisma), prisma };
}

describe("SettingsReauthService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("rejects a wrong password and throttles after five failures", async () => {
    const { service } = await setup();
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(service.issue("admin-1", "wrong", "payment.bkash.number")).rejects.toThrow(
        /Incorrect password/,
      );
    }
    await expect(service.issue("admin-1", "CorrectPass1", "payment.bkash.number")).rejects.toThrow(
      /Too many/,
    );
  });

  it("accepts the correct password and rejects an expired token", async () => {
    const { service } = await setup();
    const now = Date.now();
    const { token } = await service.issue("admin-1", "CorrectPass1", "payment.bkash.number");
    jest.spyOn(Date, "now").mockReturnValue(now + 6 * 60 * 1000);
    expect(() => service.assert(token, "admin-1", "payment.bkash.number")).toThrow(/expired/);
  });

  it("rejects a token reused for a different key", async () => {
    const { service } = await setup();
    const { token } = await service.issue("admin-1", "CorrectPass1", "payment.bkash.number");
    expect(() => service.assert(token, "admin-1", "payment.nagad.number")).toThrow(/does not match/);
  });

  it("rejects token reuse and wrong admin", async () => {
    const { service } = await setup();
    const first = await service.issue("admin-1", "CorrectPass1", "payment.bkash.number");
    service.assert(first.token, "admin-1", "payment.bkash.number");
    expect(() => service.assert(first.token, "admin-1", "payment.bkash.number")).toThrow(/expired/);

    const second = await service.issue("admin-1", "CorrectPass1", "payment.bkash.number");
    expect(() => service.assert(second.token, "admin-2", "payment.bkash.number")).toThrow(
      /does not match/,
    );
  });
});
