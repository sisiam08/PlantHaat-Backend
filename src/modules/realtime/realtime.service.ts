import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import type { Namespace, Socket } from "socket.io";

import { AppConfigService } from "../../config/app-config.service";
import { setRealtimeAllowedOrigins } from "./realtime.origins";

interface ConnectionState {
  clientId: string;
  userId: string;
  sid: string;
  connectedAt: number;
}

interface NotificationCreatedEvent {
  userId: string;
  notification: unknown;
  unreadCount: number;
}

interface NotificationReadEvent {
  userId: string;
  unreadCount: number;
}

interface BulkCreatedEvent {
  userIds: string[];
}

interface SessionRevokedEvent {
  userId: string;
  sid?: string;
}

interface UserSuspendedEvent {
  userId: string;
}

const BULK_REFRESH_BATCH = 500;

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server?: Namespace;
  private readonly byUser = new Map<string, Map<string, ConnectionState>>();
  private readonly bySid = new Map<string, Set<string>>();

  constructor(private readonly config: AppConfigService) {
    setRealtimeAllowedOrigins(config.values.CORS_ORIGINS);
  }

  attach(namespace: Namespace): void {
    this.server = namespace;
  }

  register(client: Socket, state: ConnectionState): void {
    const userMap = this.byUser.get(state.userId) ?? new Map<string, ConnectionState>();
    userMap.set(state.clientId, state);
    this.byUser.set(state.userId, userMap);

    const sidSet = this.bySid.get(state.sid) ?? new Set<string>();
    sidSet.add(state.clientId);
    this.bySid.set(state.sid, sidSet);

    void client.join(`user:${state.userId}`);
    this.enforceConnectionCap(state.userId);
  }

  unregister(clientId: string): void {
    for (const [userId, userMap] of this.byUser) {
      const state = userMap.get(clientId);
      if (!state) {
        continue;
      }
      userMap.delete(clientId);
      if (userMap.size === 0) {
        this.byUser.delete(userId);
      }
      const sidSet = this.bySid.get(state.sid);
      if (sidSet) {
        sidSet.delete(clientId);
        if (sidSet.size === 0) {
          this.bySid.delete(state.sid);
        }
      }
      return;
    }
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  disconnectClient(clientId: string, reason: string): void {
    const socket = this.server?.sockets.get(clientId);
    if (!socket) {
      return;
    }
    socket.emit("session:revoked", { reason });
    socket.disconnect(true);
  }

  disconnectSession(sid: string, reason: string): void {
    const clientIds = this.bySid.get(sid);
    if (!clientIds) {
      return;
    }
    for (const clientId of [...clientIds]) {
      this.disconnectClient(clientId, reason);
    }
  }

  disconnectUser(userId: string, reason: string): void {
    const userMap = this.byUser.get(userId);
    if (!userMap) {
      return;
    }
    for (const clientId of [...userMap.keys()]) {
      this.disconnectClient(clientId, reason);
    }
  }

  @OnEvent("notification.created", { async: true })
  handleNotificationCreated(payload: NotificationCreatedEvent): void {
    this.emitToUser(payload.userId, "notification:new", payload.notification);
    this.emitToUser(payload.userId, "notification:unread_count", { count: payload.unreadCount });
  }

  @OnEvent("notification.read", { async: true })
  handleNotificationRead(payload: NotificationReadEvent): void {
    this.emitToUser(payload.userId, "notification:unread_count", { count: payload.unreadCount });
  }

  @OnEvent("notification.read_all", { async: true })
  handleNotificationReadAll(payload: NotificationReadEvent): void {
    this.emitToUser(payload.userId, "notification:unread_count", { count: payload.unreadCount });
  }

  @OnEvent("notifications.bulk_created", { async: true })
  handleBulkCreated(payload: BulkCreatedEvent): void {
    for (let index = 0; index < payload.userIds.length; index += BULK_REFRESH_BATCH) {
      const batch = payload.userIds.slice(index, index + BULK_REFRESH_BATCH);
      for (const userId of batch) {
        this.emitToUser(userId, "notification:refresh", {});
      }
    }
  }

  @OnEvent("auth.session_revoked", { async: true })
  handleSessionRevoked(payload: SessionRevokedEvent): void {
    if (payload.sid) {
      this.disconnectSession(payload.sid, "session_revoked");
    } else {
      this.disconnectUser(payload.userId, "session_revoked");
    }
  }

  @OnEvent("user.suspended", { async: true })
  handleUserSuspended(payload: UserSuspendedEvent): void {
    this.disconnectUser(payload.userId, "account_suspended");
  }

  private enforceConnectionCap(userId: string): void {
    const userMap = this.byUser.get(userId);
    if (!userMap) {
      return;
    }
    const max = this.config.values.REALTIME_MAX_CONNECTIONS_PER_USER;
    if (userMap.size <= max) {
      return;
    }
    const ordered = [...userMap.values()].sort((a, b) => a.connectedAt - b.connectedAt);
    const excess = userMap.size - max;
    for (let index = 0; index < excess; index += 1) {
      const oldest = ordered[index];
      this.logger.debug(`Disconnecting oldest socket for user ${userId} (connection cap)`);
      this.disconnectClient(oldest.clientId, "connection_limit");
    }
  }
}
