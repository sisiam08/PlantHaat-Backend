import { Logger } from "@nestjs/common";
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Namespace, Server, Socket } from "socket.io";

import { ClientIpService } from "../../common/client-ip/client-ip.service";
import { AppConfigService } from "../../config/app-config.service";
import { PrismaService } from "../../prisma/prisma.service";
import { isRealtimeOriginAllowed } from "./realtime.origins";
import { RealtimeService } from "./realtime.service";
import type { TicketRecord } from "./ticket.store";
import { TicketService } from "./ticket.service";

const NAMESPACE = "/realtime";
const HANDSHAKE_RATE_WINDOW_MS = 60_000;
const HANDSHAKE_RATE_LIMIT = 30;
const MAX_HANDSHAKE_TRACKERS = 10_000;

type MiddlewareNext = (err?: Error) => void;

@WebSocketGateway({
  namespace: NAMESPACE,
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) =>
      callback(null, isRealtimeOriginAllowed(origin)),
    credentials: false,
  },
  allowRequest: (
    request: { headers: Record<string, string | string[] | undefined> },
    callback: (err: string | null, success: boolean) => void,
  ) => callback(null, isRealtimeOriginAllowed(asString(request.headers.origin))),
  maxHttpBufferSize: 64 * 1024,
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly handshakeHits = new Map<string, { count: number; windowStart: number }>();
  private readonly ageTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly realtime: RealtimeService,
    private readonly tickets: TicketService,
    private readonly prisma: PrismaService,
    private readonly clientIp: ClientIpService,
    private readonly config: AppConfigService,
  ) {}

  afterInit(server: Server): void {
    const namespace = this.resolveNamespace(server);
    this.realtime.attach(namespace);
    namespace.use((socket, next) => {
      void this.authenticate(socket, next);
    });
  }

  /**
   * Depending on the Nest/Socket.IO version the injected server is either the
   * root `Server` (exposes `of`) or the declared `Namespace` itself.
   */
  private resolveNamespace(server: Server): Namespace {
    const maybeRoot = server as unknown as { of?: (name: string) => Namespace };
    if (typeof maybeRoot.of === "function") {
      return maybeRoot.of(NAMESPACE);
    }
    return server as unknown as Namespace;
  }

  handleConnection(client: Socket): void {
    const record = (client.data as { auth?: TicketRecord }).auth;
    if (!record) {
      client.disconnect(true);
      return;
    }

    this.realtime.register(client, {
      clientId: client.id,
      userId: record.userId,
      sid: record.sid,
      connectedAt: Date.now(),
    });

    const timer = setTimeout(() => {
      this.realtime.disconnectClient(client.id, "reauth");
    }, this.config.values.REALTIME_MAX_AGE_SECONDS * 1000);
    this.ageTimers.set(client.id, timer);

    this.logger.debug(`Realtime connection ${client.id} for user ${record.userId}`);
  }

  handleDisconnect(client: Socket): void {
    const timer = this.ageTimers.get(client.id);
    if (timer) {
      clearTimeout(timer);
      this.ageTimers.delete(client.id);
    }
    this.realtime.unregister(client.id);
  }

  private async authenticate(socket: Socket, next: MiddlewareNext): Promise<void> {
    try {
      const origin = asString(socket.handshake.headers.origin);
      if (!isRealtimeOriginAllowed(origin)) {
        next(new Error("ORIGIN_NOT_ALLOWED"));
        return;
      }

      const handshakeIp = this.clientIp.resolve(
        socket.handshake.headers,
        socket.handshake.address,
      );
      if (!this.allowHandshakeRate(handshakeIp)) {
        next(new Error("TOO_MANY_REQUESTS"));
        return;
      }

      const auth = socket.handshake.auth as Record<string, unknown> | undefined;
      const record = await this.tickets.consume(auth?.ticket);
      if (!record) {
        next(new Error("UNAUTHENTICATED"));
        return;
      }

      const [user, session] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: record.userId },
          select: { id: true, status: true, deletedAt: true },
        }),
        this.prisma.refreshSession.findUnique({
          where: { id: record.sid },
          select: { revokedAt: true, expiresAt: true },
        }),
      ]);

      if (!user || user.deletedAt) {
        next(new Error("UNAUTHENTICATED"));
        return;
      }
      if (user.status !== "ACTIVE") {
        next(new Error("ACCOUNT_SUSPENDED"));
        return;
      }
      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        next(new Error("SESSION_EXPIRED"));
        return;
      }

      (socket.data as { auth?: TicketRecord }).auth = record;
      next();
    } catch (error) {
      this.logger.warn(
        `Realtime handshake failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
      next(new Error("UNAUTHENTICATED"));
    }
  }

  private allowHandshakeRate(ip: string): boolean {
    const now = Date.now();
    if (this.handshakeHits.size > MAX_HANDSHAKE_TRACKERS) {
      for (const [key, entry] of this.handshakeHits) {
        if (now - entry.windowStart >= HANDSHAKE_RATE_WINDOW_MS) {
          this.handshakeHits.delete(key);
        }
      }
    }
    const entry = this.handshakeHits.get(ip);
    if (!entry || now - entry.windowStart >= HANDSHAKE_RATE_WINDOW_MS) {
      this.handshakeHits.set(ip, { count: 1, windowStart: now });
      return true;
    }
    entry.count += 1;
    return entry.count <= HANDSHAKE_RATE_LIMIT;
  }
}

function asString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
