import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { Public } from "../../common/decorators/public.decorator";
import { LocationsService } from "./locations.service";

@ApiTags("Locations")
@Controller("locations")
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Public()
  @Get("districts")
  @ApiOperation({ summary: "List all 64 districts (with division and Bangla name)" })
  listDistricts() {
    return this.locationsService.listDistricts();
  }
}
