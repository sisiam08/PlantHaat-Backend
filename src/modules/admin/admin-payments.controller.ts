import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { Roles } from "../../common/decorators/roles.decorator";
import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from "../../common/swagger/api-response.decorators";
import { Role } from "../../generated/prisma/enums";
import { AdminPaymentsService } from "./admin-payments.service";
import { PaymentDto } from "./dto/payment.dto";
import { QueryPaymentsDto } from "./dto/query-payments.dto";

@ApiTags("Admin: payments")
@Roles(Role.ADMIN)
@Controller("admin/payments")
export class AdminPaymentsController {
  constructor(private readonly adminPayments: AdminPaymentsService) {}

  @Get()
  @ApiOperation({ summary: "List payments (filters: status, method, order, from, to)" })
  @ApiPaginatedResponse(PaymentDto)
  list(@Query() query: QueryPaymentsDto) {
    return this.adminPayments.list(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a payment" })
  @ApiEnvelopeResponse(PaymentDto)
  get(@Param("id") id: string) {
    return this.adminPayments.get(id);
  }
}
