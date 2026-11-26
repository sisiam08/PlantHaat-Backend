import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import { io, type Socket } from "socket.io-client";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { AppConfigService } from "../src/config/app-config.service";
import { AnnouncementsService } from "../src/modules/announcements/announcements.service";
import { NotificationsService } from "../src/modules/notifications/notifications.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./cleanup";

const API = "/api/v1";
const ORIGIN = "http://localhost:3000";
const CONNECT_TIMEOUT = 8000;

function suffix(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function waitForEvent(socket: Socket, event: string, timeoutMs = CONNECT_TIMEOUT): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (...args: unknown[]) => {
      clearTimeout(timer);
      resolve(args);
    });
  });
}

describe("Realtime gateway (e2e)", () => {
  let app: INestApplication;
  let httpServer: Server;
  let prisma: PrismaService;
  let baseUrl: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(AppConfigService), {
      swagger: false,
      helmet: false,
      staticFiles: false,
    });
    await app.listen(0);
    httpServer = app.getHttpServer() as Server;
    const address = httpServer.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const socket of sockets) {
      socket.disconnect();
    }
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    sockets.length = 0;
  });

  function connect(ticket: string, extra?: { extraHeaders?: Record<string, string> }): Socket {
    const socket = io(`${baseUrl}/realtime`, {
      transports: ["websocket"],
      auth: { ticket },
      reconnection: false,
      forceNew: true,
      ...extra,
    });
    sockets.push(socket);
    return socket;
  }

  async function registerCustomer() {
    const agent = request.agent(httpServer);
    const email = `rt_${suffix()}@example.com`;
    const res = await agent
      .post(`${API}/auth/register`)
      .send({ email, password: "Str0ngPass1!", name: "Realtime User" })
      .expect(201);
    return { agent, userId: res.body.data.user.id as string, email };
  }

  async function issueTicket(agent: ReturnType<typeof request.agent>): Promise<string> {
    const res = await agent.post(`${API}/realtime/ticket`).set("Origin", ORIGIN).expect(200);
    return res.body.data.ticket as string;
  }

  it("accepts a valid ticket and rejects a reused one", async () => {
    const { agent } = await registerCustomer();
    const ticket = await issueTicket(agent);

    const first = connect(ticket);
    await waitForEvent(first, "connect");
    first.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const second = connect(ticket);
    const [error] = await waitForEvent(second, "connect_error");
    expect((error as Error).message).toBe("UNAUTHENTICATED");
  });

  it("rejects an invalid ticket", async () => {
    const socket = connect("not-a-real-ticket");
    const [error] = await waitForEvent(socket, "connect_error");
    expect((error as Error).message).toBe("UNAUTHENTICATED");
  });

  it("rejects an expired ticket", async () => {
    const { agent } = await registerCustomer();
    const ticket = await issueTicket(agent);
    await new Promise((resolve) => setTimeout(resolve, 2200));

    const socket = connect(ticket);
    const [error] = await waitForEvent(socket, "connect_error");
    expect((error as Error).message).toBe("UNAUTHENTICATED");
  });

  it("rejects a suspended user", async () => {
    const { agent, userId } = await registerCustomer();
    const ticket = await issueTicket(agent);
    await prisma.user.update({ where: { id: userId }, data: { status: "SUSPENDED" } });

    const socket = connect(ticket);
    const [error] = await waitForEvent(socket, "connect_error");
    expect((error as Error).message).toBe("ACCOUNT_SUSPENDED");
  });

  it("rejects a disallowed Origin", async () => {
    const { agent } = await registerCustomer();
    const ticket = await issueTicket(agent);
    const socket = connect(ticket, { extraHeaders: { Origin: "https://evil.example" } });
    const [error] = await waitForEvent(socket, "connect_error");
    expect(error).toBeInstanceOf(Error);
  });

  it("pushes notification:new and unread_count", async () => {
    const { agent, userId } = await registerCustomer();
    const ticket = await issueTicket(agent);
    const socket = connect(ticket);
    await waitForEvent(socket, "connect");

    const notifications = app.get(NotificationsService);
    const created = waitForEvent(socket, "notification:new");
    const count = waitForEvent(socket, "notification:unread_count");
    await notifications.create({
      userId,
      type: "SYSTEM",
      title: "Hello",
      body: "World",
    });

    const [notification] = (await created) as [{ title: string }];
    expect(notification.title).toBe("Hello");
    const [countPayload] = (await count) as [{ count: number }];
    expect(countPayload.count).toBe(1);
  });

  it("pushes notification:refresh after an announcement", async () => {
    const { agent } = await registerCustomer();
    const ticket = await issueTicket(agent);
    const socket = connect(ticket);
    await waitForEvent(socket, "connect");

    const announcements = app.get(AnnouncementsService);
    const refreshed = waitForEvent(socket, "notification:refresh");
    await announcements.create(
      { title: "Sale", body: "Big sale today", audience: "CUSTOMERS" },
      "admin-id",
    );
    await refreshed;
  });

  it("disconnects the user on logout", async () => {
    const { agent } = await registerCustomer();
    const ticket = await issueTicket(agent);
    const socket = connect(ticket);
    await waitForEvent(socket, "connect");

    const revoked = waitForEvent(socket, "session:revoked");
    await agent.post(`${API}/auth/logout`).set("Origin", ORIGIN).expect(204);
    const [payload] = (await revoked) as [{ reason: string }];
    expect(payload.reason).toBe("session_revoked");
  });

  it("enforces the per-user connection cap", async () => {
    const { agent } = await registerCustomer();
    const ticket1 = await issueTicket(agent);
    const ticket2 = await issueTicket(agent);
    const ticket3 = await issueTicket(agent);

    const socket1 = connect(ticket1);
    await waitForEvent(socket1, "connect");
    const socket2 = connect(ticket2);
    await waitForEvent(socket2, "connect");

    const revoked1 = waitForEvent(socket1, "session:revoked");
    const socket3 = connect(ticket3);
    await waitForEvent(socket3, "connect");

    const [payload] = (await revoked1) as [{ reason: string }];
    expect(payload.reason).toBe("connection_limit");
  });

  it("disconnects after the max connection age", async () => {
    const { agent } = await registerCustomer();
    const ticket = await issueTicket(agent);
    const socket = connect(ticket);
    await waitForEvent(socket, "connect");

    const [payload] = (await waitForEvent(socket, "session:revoked", 6000)) as [{ reason: string }];
    expect(payload.reason).toBe("reauth");
  });
});
