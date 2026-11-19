import { randomUUID } from "node:crypto";

import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { hashPassword } from "../src/common/utils/password";
import { AppConfigService } from "../src/config/app-config.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { SettingsService } from "../src/modules/settings/settings.service";
import { setSettings, clearSettings } from "./settings-test-helper";
import { resetDatabase } from "./cleanup";

const API = "/api/v1";
const ORIGIN = "http://localhost:3000";

function url(label: string) {
  return `https://res.cloudinary.com/demo/image/upload/${label}-${randomUUID()}.webp`;
}

describe("Home highlights (e2e)", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let admin: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(AppConfigService), {
      swagger: false,
      helmet: false,
      staticFiles: false,
    });
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await clearSettings(app, prisma);
    await resetDatabase(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await clearSettings(app, prisma);
    const email = `admin_${randomUUID().slice(0, 8)}@example.com`;
    await prisma.user.create({
      data: {
        email,
        name: "Admin",
        passwordHash: await hashPassword("AdminStr0ng1"),
        role: "ADMIN",
        emailVerifiedAt: new Date(),
      },
    });
    admin = request.agent(server);
    await admin.post(`${API}/auth/login`).send({ email, password: "AdminStr0ng1" }).expect(200);
  });

  afterEach(async () => {
    await clearSettings(app, prisma);
  });

  async function asset(label: string, width = 1920, height = 640) {
    const imageUrl = url(label);
    await prisma.uploadedAsset.create({
      data: {
        publicId: imageUrl.split("/").pop()!,
        url: imageUrl,
        purpose: "banner",
        status: "PENDING",
        width,
        height,
      },
    });
    return imageUrl;
  }

  function createSlide(overrides: Record<string, unknown> = {}) {
    return admin
      .post(`${API}/admin/banners`)
      .set("Origin", ORIGIN)
      .send({
        placement: "HOME_HIGHLIGHTS",
        imageUrl: overrides.imageUrl ?? url("default"),
        imageWidth: 1920,
        imageHeight: 640,
        isActive: true,
        ...overrides,
      });
  }

  it("requires admin authentication and role", async () => {
    await request(server).get(`${API}/admin/banners`).expect(401);
    const customerEmail = `customer_${randomUUID().slice(0, 8)}@example.com`;
    await prisma.user.create({
      data: {
        email: customerEmail,
        name: "Customer",
        passwordHash: await hashPassword("Customer1"),
        role: "CUSTOMER",
        emailVerifiedAt: new Date(),
      },
    });
    const customer = request.agent(server);
    await customer
      .post(`${API}/auth/login`)
      .send({ email: customerEmail, password: "Customer1" })
      .expect(200);
    await customer.get(`${API}/admin/banners`).expect(403);
  });

  it("creates a slide, attaches uploads and returns public fields only", async () => {
    const desktop = await asset("desktop");
    const mobile = await asset("mobile", 960, 640);
    const created = await createSlide({
      imageUrl: desktop,
      mobileImageUrl: mobile,
      imageAltEn: "Spring sale",
      imageAltBn: "বসন্তের অফার",
      overlayEnabled: true,
      headlineEn: "Spring sale",
      headlineBn: "বসন্তের অফার",
      subtextEn: "Up to 30% off plants",
      subtextBn: "গাছে ৩০% পর্যন্ত ছাড়",
      buttonEnabled: true,
      buttonLabelEn: "Shop now",
      buttonLabelBn: "কিনুন",
      buttonHref: "/products?sort=newest",
      buttonStyle: "primary",
    }).expect(201);

    expect(created.body.data.imageUrl).toBe(desktop);
    const assets = await prisma.uploadedAsset.findMany({
      where: { url: { in: [desktop, mobile] } },
    });
    expect(assets.every((row) => row.status === "ATTACHED")).toBe(true);

    const publicResponse = await request(server).get(`${API}/home/highlights`).expect(200);
    expect(publicResponse.headers["cache-control"]).toContain("max-age=30");
    expect(publicResponse.headers.etag).toBeTruthy();
    expect(publicResponse.body.data.slides).toHaveLength(1);
    const slide = publicResponse.body.data.slides[0];
    expect(slide.image.url).toBe(desktop);
    expect(slide.mobileImage.url).toBe(mobile);
    expect(slide.overlay.headline.en).toBe("Spring sale");
    expect(slide.button.label.bn).toBe("কিনুন");
    expect(slide.createdById).toBeUndefined();
    expect(slide.updatedById).toBeUndefined();
    expect(slide.placement).toBeUndefined();

    const etag = publicResponse.headers.etag;
    await request(server).get(`${API}/home/highlights`).set("If-None-Match", etag).expect(304);
  });

  it("blocks unsafe links and unreadable custom buttons", async () => {
    const imageUrl = await asset("safe");
    await createSlide({ imageUrl, linkUrl: "javascript:alert(1)" }).expect(400);
    await createSlide({
      imageUrl,
      buttonEnabled: true,
      buttonLabelEn: "Go",
      buttonLabelBn: "যান",
      buttonHref: "data:text/html,x",
    }).expect(400);
    await createSlide({
      imageUrl,
      overlayEnabled: true,
      headlineEn: "Unreadable",
      scrimColor: "#FFFFFF",
      scrimOpacity: 95,
      textColor: "#FFFF00",
    }).expect(400);
    await createSlide({
      imageUrl,
      buttonEnabled: true,
      buttonLabelEn: "Go",
      buttonLabelBn: "যান",
      buttonHref: "/products",
      buttonStyle: "custom",
      buttonBgColor: "#FFFF00",
      buttonTextColor: "#FFFFFF",
    }).expect(400);
  });

  it("warns instead of blocking slightly off-aspect images", async () => {
    const imageUrl = await asset("square", 1000, 1000);
    const response = await createSlide({ imageUrl, imageWidth: 1000, imageHeight: 1000 }).expect(
      201,
    );
    expect(response.body.data.warnings.join(" ")).toContain("3:1");
  });

  it("respects the schedule and the feature toggle", async () => {
    const imageUrl = await asset("scheduled");
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const expired = new Date(Date.now() - 86_400_000).toISOString();
    const active = await createSlide({ imageUrl }).expect(201);
    const secondImage = await asset("future");
    await createSlide({
      imageUrl: secondImage,
      startsAt: future,
      isActive: true,
    }).expect(201);
    const thirdImage = await asset("expired");
    await createSlide({
      imageUrl: thirdImage,
      endsAt: expired,
      isActive: true,
    }).expect(201);

    const publicResponse = await request(server).get(`${API}/home/highlights`).expect(200);
    expect(publicResponse.body.data.slides.map((slide: { id: string }) => slide.id)).toEqual([
      active.body.data.id,
    ]);

    await setSettings(app, prisma, { "home.highlights.enabled": false });
    const off = await request(server).get(`${API}/home/highlights`).expect(200);
    expect(off.body.data.enabled).toBe(false);
    expect(off.body.data.slides).toEqual([]);
  });

  it("reorders in one call, duplicates as hidden and cleans unreferenced assets on delete", async () => {
    const a = await createSlide({ imageUrl: await asset("a") }).expect(201);
    const bImage = await asset("b");
    const b = await createSlide({ imageUrl: bImage }).expect(201);

    await admin
      .patch(`${API}/admin/banners/reorder`)
      .set("Origin", ORIGIN)
      .send({ ids: [b.body.data.id, a.body.data.id] })
      .expect(200);
    const list = await admin.get(`${API}/admin/banners?placement=HOME_HIGHLIGHTS`).expect(200);
    expect(list.body.data.map((row: { id: string }) => row.id)).toEqual([
      b.body.data.id,
      a.body.data.id,
    ]);

    const copy = await admin
      .post(`${API}/admin/banners/${a.body.data.id}/duplicate`)
      .set("Origin", ORIGIN)
      .expect(201);
    expect(copy.body.data.isActive).toBe(false);
    expect(copy.body.data.id).not.toBe(a.body.data.id);

    await admin
      .delete(`${API}/admin/banners/${b.body.data.id}`)
      .set("Origin", ORIGIN)
      .expect(204);
    expect(await prisma.uploadedAsset.count({ where: { url: bImage } })).toBe(0);
  });

  it("enforces the configured visible slide cap", async () => {
    await setSettings(app, prisma, { "home.highlights.maxSlides": 1 });
    await createSlide({ imageUrl: await asset("one") }).expect(201);
    const second = await createSlide({ imageUrl: await asset("two") }).expect(409);
    expect(second.body.error.message).toMatch(/maximum/i);
  });

  it("resets the settings cache after a slide change so the public endpoint updates", async () => {
    const imageUrl = await asset("cache");
    const created = await createSlide({ imageUrl }).expect(201);
    expect((await request(server).get(`${API}/home/highlights`)).body.data.slides).toHaveLength(1);
    await admin
      .patch(`${API}/admin/banners/${created.body.data.id}`)
      .set("Origin", ORIGIN)
      .send({ isActive: false })
      .expect(200);
    app.get(SettingsService).invalidate();
    expect((await request(server).get(`${API}/home/highlights`)).body.data.slides).toHaveLength(0);
  });
});
