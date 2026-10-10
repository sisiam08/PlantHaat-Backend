import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { Public } from "../../common/decorators/public.decorator";
import { HealthService } from "./health.service";

@ApiTags("Ops")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Liveness check including a database round-trip" })
  check() {
    return this.healthService.check();
  }

  @Public()
  @Get("ready")
  @ApiOperation({ summary: "Readiness check" })
  ready() {
    return this.healthService.check();
  }
}
