import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { Roles } from "../../common/decorators/roles.decorator";
import { Role } from "../../generated/prisma/enums";
import {
  CacheQueryDto,
  ImportOverridesDto,
  OverrideInputDto,
  UpdateMappingDto,
  UpdateThanaDto,
  WarmUpDto,
} from "./admin-delivery-rates.dto";
import { AdminDeliveryRatesService } from "./admin-delivery-rates.service";

@ApiTags("Admin delivery rates")
@Roles(Role.ADMIN)
@Controller("admin/delivery-rates")
export class AdminDeliveryRatesController {
  constructor(private readonly service: AdminDeliveryRatesService) {}

  @Get("cache")
  @ApiOperation({ summary: "List the courier quote cache (filterable)" })
  listCache(@Query() query: CacheQueryDto) {
    return this.service.listCache(query);
  }

  @Get("health")
  @ApiOperation({ summary: "Live quote switch, circuit state and cache counts" })
  health() {
    return this.service.health();
  }

  @Get("mapping")
  @ApiOperation({ summary: "District -> Steadfast mapping" })
  mapping() {
    return this.service.mapping();
  }

  @Patch("mapping/:districtId")
  @ApiOperation({ summary: "Set or clear a district's Steadfast location" })
  updateMapping(
    @Param("districtId", ParseIntPipe) districtId: number,
    @Body() dto: UpdateMappingDto,
  ) {
    return this.service.updateMapping(districtId, dto.steadfastLocationId ?? null);
  }

  @Get("thanas")
  @ApiOperation({ summary: "List thanas (defaults to Dhaka) for the zone editor" })
  thanas(@Query("districtId") districtId?: string) {
    const parsed = districtId ? Number(districtId) : undefined;
    return this.service.listThanas(
      parsed && Number.isFinite(parsed) ? parsed : undefined,
    );
  }

  @Patch("thanas/:id")
  @ApiOperation({ summary: "Update a Dhaka thana's City/Sub-Urban zone" })
  updateThana(@Param("id") id: string, @Body() dto: UpdateThanaDto) {
    return this.service.updateThana(id, dto);
  }

  @Get("overrides")
  @ApiOperation({ summary: "List manual override rows" })
  overrides() {
    return this.service.listOverrides();
  }

  @Post("overrides")
  @ApiOperation({ summary: "Create or replace a manual override row" })
  upsertOverride(@Body() dto: OverrideInputDto) {
    return this.service.createOrUpdateOverride(dto);
  }

  @Delete("overrides/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a manual override row" })
  async deleteOverride(@Param("id") id: string) {
    await this.service.deleteOverride(id);
  }

  @Get("overrides/export")
  @ApiOperation({ summary: "Export override rows as CSV" })
  async exportOverrides() {
    return { csv: await this.service.exportOverridesCsv() };
  }

  @Post("overrides/import")
  @ApiOperation({ summary: "Validate and optionally apply override CSV rows" })
  importOverrides(@Body() dto: ImportOverridesDto) {
    return this.service.importOverridesCsv(dto.csv, dto.dryRun ?? true);
  }

  @Post("warm-up")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Queue live quotes for a shop's pickup to every destination" })
  warmUp(@Body() dto: WarmUpDto) {
    return this.service.warmUp(dto.shopId);
  }
}
