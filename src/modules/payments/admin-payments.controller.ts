import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { Role } from "../../generated/prisma/enums";
import { CompleteRefundDto, RejectPaymentDto, VerifyPaymentDto } from "./dto/payment.dto";
import { PaymentsService } from "./payments.service";

@ApiTags("Admin: advance payments")
@Roles(Role.ADMIN)
@Controller("admin")
export class AdminAdvancePaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get("advance-payments")
  @ApiOperation({ summary: "List advance-payment intents (filter=pending|sla)" })
  list(@Query("filter") filter?: string) {
    return this.payments.listAdmin(filter);
  }

  @Post("advance-payments/:id/verify")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify a submission with the amount received" })
  verify(
    @Param("id") id: string,
    @Body() dto: VerifyPaymentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Query() _query: unknown,
  ) {
    void _query;
    return this.payments.verify(id, dto.amountReceived, actor, {});
  }

  @Post("advance-payments/:id/reject")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reject the pending submission with a reason" })
  reject(
    @Param("id") id: string,
    @Body() dto: RejectPaymentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.payments.reject(id, dto.reason, actor, {});
  }

  @Get("advance-refunds")
  @ApiOperation({ summary: "Refund obligations queue" })
  refunds() {
    return this.payments.refundQueue();
  }

  @Post("advance-refunds/:id/complete")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark a refund complete with the refund transaction ID" })
  completeRefund(
    @Param("id") id: string,
    @Body() dto: CompleteRefundDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.payments.completeRefund(id, dto.refundTrxId, actor, {});
  }
}
