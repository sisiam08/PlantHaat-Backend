import { Inject, Injectable } from "@nestjs/common";

import { randomToken, sha256Hex } from "../../common/utils/crypto";
import { AppConfigService } from "../../config/app-config.service";
import type { Role } from "../../generated/prisma/enums";
import { TICKET_STORE, type TicketRecord, type TicketStore } from "./ticket.store";

export interface IssuedTicket {
  ticket: string;
  expiresInSeconds: number;
}

@Injectable()
export class TicketService {
  constructor(
    @Inject(TICKET_STORE) private readonly store: TicketStore,
    private readonly config: AppConfigService,
  ) {}

  async issue(input: { userId: string; sid: string; role: Role }): Promise<IssuedTicket> {
    const ticket = randomToken(32);
    const ttlSeconds = this.config.values.REALTIME_TICKET_TTL_SECONDS;
    await this.store.save(sha256Hex(ticket), {
      userId: input.userId,
      sid: input.sid,
      role: input.role,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return { ticket, expiresInSeconds: ttlSeconds };
  }

  async consume(ticket: unknown): Promise<TicketRecord | undefined> {
    if (typeof ticket !== "string" || ticket.length === 0) {
      return undefined;
    }
    return this.store.consume(sha256Hex(ticket));
  }
}
