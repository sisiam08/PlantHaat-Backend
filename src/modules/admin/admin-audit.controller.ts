import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { Roles } from "../../common/decorators/roles.decorator";
import { Role } from "../../generated/prisma/enums";
import { AuditService } from "../audit/audit.service";
import { QueryAuditLogDto } from "../audit/dto/query-audit-log.dto";

@ApiTags("Admin: audit")
@Roles(Role.ADMIN)
@Controller("admin/audit-logs")
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: "List audit log entries" })
  list(@Query() query: QueryAuditLogDto) {
    return this.audit.list(query);
  }
}
