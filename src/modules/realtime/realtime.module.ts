import { Module } from "@nestjs/common";

import { RealtimeController } from "./realtime.controller";
import { RealtimeGateway } from "./realtime.gateway";
import { RealtimeService } from "./realtime.service";
import { TicketService } from "./ticket.service";
import { InMemoryTicketStore, TICKET_STORE } from "./ticket.store";

@Module({
  controllers: [RealtimeController],
  providers: [
    RealtimeService,
    RealtimeGateway,
    TicketService,
    { provide: TICKET_STORE, useClass: InMemoryTicketStore },
  ],
  exports: [RealtimeService, TicketService],
})
export class RealtimeModule {}
