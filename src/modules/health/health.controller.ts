import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { Public } from "../../common/decorators/public.decorator";
import { HealthCheckDto } from "./dto/health-response.dto";
import { HealthService } from "./health.service";
import { ApiEnvelopeResponse } from "../../common/swagger/api-response.decorators";

@ApiTags("Ops")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Liveness check including a database round-trip" })
  @ApiEnvelopeResponse(HealthCheckDto)
  check() {
    return this.healthService.check();
  }

  @Public()
  @Get("ready")
  @ApiOperation({ summary: "Readiness check" })
  @ApiOkResponse({ schema: { type: "object", properties: { status: { example: "ok" } } } })
  ready() {
    return this.healthService.check();
  }
}
