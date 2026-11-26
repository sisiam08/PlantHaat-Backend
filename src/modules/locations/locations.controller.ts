import { Controller, Get, ParseIntPipe, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";

import { Public } from "../../common/decorators/public.decorator";
import {
  ApiEnvelopeArrayResponse,
} from "../../common/swagger/api-response.decorators";
import { DistrictDto, ThanaDto } from "./dto/district.dto";
import { LocationsService } from "./locations.service";

@ApiTags("Locations")
@Controller("locations")
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Public()
  @Get("districts")
  @ApiOperation({ summary: "List all 64 districts (with division and Bangla name)" })
  @ApiEnvelopeArrayResponse(DistrictDto)
  listDistricts() {
    return this.locationsService.listDistricts();
  }

  @Public()
  @Get("thanas")
  @ApiQuery({ name: "districtId", required: true, type: Number })
  @ApiOperation({ summary: "List Steadfast thanas for a district (guests too)" })
  @ApiEnvelopeArrayResponse(ThanaDto)
  listThanas(@Query("districtId", ParseIntPipe) districtId: number) {
    return this.locationsService.listThanas(districtId);
  }
}

