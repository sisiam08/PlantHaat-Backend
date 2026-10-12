import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { Roles } from "../../common/decorators/roles.decorator";
import { ApiPaginatedResponse } from "../../common/swagger/api-response.decorators";
import { Role } from "../../generated/prisma/enums";
import { AuditService } from "../audit/audit.service";
import { QueryAuditLogDto } from "../audit/dto/query-audit-log.dto";
import { AuditLogDto } from "./dto/admin-response.dto";

@ApiTags("Admin: audit")
@Roles(Role.ADMIN)
@Controller("admin/audit-logs")
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: "List audit log entries" })
  @ApiPaginatedResponse(AuditLogDto)
  list(@Query() query: QueryAuditLogDto) {
    return this.audit.list(query);
  }
}
