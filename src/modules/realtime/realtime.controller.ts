import { Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ApiEnvelopeResponse } from "../../common/swagger/api-response.decorators";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AppConfigService } from "../../config/app-config.service";
import { RealtimeTicketDto } from "./dto/realtime-response.dto";
import { TicketService } from "./ticket.service";

@ApiTags("Realtime")
@Controller("realtime")
export class RealtimeController {
  constructor(
    private readonly tickets: TicketService,
    private readonly config: AppConfigService,
  ) {}

  @Post("ticket")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  @ApiOperation({ summary: "Issue a one-time WebSocket connection ticket" })
  @ApiEnvelopeResponse(RealtimeTicketDto)
  async ticket(@CurrentUser() user: AuthenticatedUser) {
    const issued = await this.tickets.issue({
      userId: user.id,
      sid: user.sessionId,
      role: user.role,
    });
    return {
      ticket: issued.ticket,
      expiresInSeconds: issued.expiresInSeconds,
      url: this.config.values.REALTIME_PUBLIC_URL,
    };
  }
}
