import type { Role } from "../../generated/prisma/enums";

export interface TicketRecord {
  userId: string;
  sid: string;
  role: Role;
  expiresAt: number;
}

export interface TicketStore {
  save(tokenHash: string, record: TicketRecord): Promise<void> | void;
  consume(tokenHash: string): Promise<TicketRecord | undefined> | TicketRecord | undefined;
}

export const TICKET_STORE = Symbol("TICKET_STORE");

const SWEEP_INTERVAL_MS = 60_000;

/**
 * In-memory, one-time ticket store. A multi-instance deployment needs a shared
 * store (e.g. Redis) so any node can consume a ticket — not implemented in v1.
 */
export class InMemoryTicketStore implements TicketStore {
  private readonly tickets = new Map<string, TicketRecord>();
  private lastSweep = Date.now();

  save(tokenHash: string, record: TicketRecord): void {
    this.tickets.set(tokenHash, record);
    this.sweep();
  }

  consume(tokenHash: string): TicketRecord | undefined {
    this.sweep();
    const record = this.tickets.get(tokenHash);
    if (!record) {
      return undefined;
    }
    this.tickets.delete(tokenHash);
    if (record.expiresAt < Date.now()) {
      return undefined;
    }
    return record;
  }

  private sweep(): void {
    const now = Date.now();
    if (now - this.lastSweep < SWEEP_INTERVAL_MS) {
      return;
    }
    this.lastSweep = now;
    for (const [hash, record] of this.tickets) {
      if (record.expiresAt < now) {
        this.tickets.delete(hash);
      }
    }
  }
}
