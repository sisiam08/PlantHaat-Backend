import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Role } from "../../generated/prisma/enums";
import { CreatePaymentSubmissionDto } from "./dto/payment.dto";
import { PaymentsService } from "./payments.service";

@ApiTags("Advance payments")
@Roles(Role.CUSTOMER)
@Controller("advance-payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get("orders/:orderId")
  @ApiOperation({ summary: "Payment amount, snapshotted provider details, submissions and remaining amount" })
  info(@CurrentUser("id") customerId: string, @Param("orderId") orderId: string) {
    return this.payments.buyerInfo(customerId, orderId);
  }

  @Post("orders/:orderId/submissions")
  @ApiOperation({ summary: "Submit a bKash/Nagad transaction ID for manual verification" })
  submit(
    @CurrentUser("id") customerId: string,
    @Param("orderId") orderId: string,
    @Body() dto: CreatePaymentSubmissionDto,
  ) {
    return this.payments.submit(customerId, orderId, dto);
  }
}
