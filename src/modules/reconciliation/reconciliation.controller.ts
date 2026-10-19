import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { Roles } from "../../common/decorators/roles.decorator";
import { ApiEnvelopeResponse } from "../../common/swagger/api-response.decorators";
import { Role } from "../../generated/prisma/enums";
import { QueryReconciliationDto } from "./dto/query-reconciliation.dto";
import { ReconciliationResponseDto } from "./dto/reconciliation-response.dto";
import { ReconciliationService } from "./reconciliation.service";

@ApiTags("Admin: reconciliation")
@Roles(Role.ADMIN)
@Controller("admin")
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get("reconciliation")
  @ApiOperation({ summary: "Check money invariants over a date range" })
  @ApiEnvelopeResponse(ReconciliationResponseDto)
  run(@Query() query: QueryReconciliationDto) {
    return this.reconciliation.run(query);
  }
}
