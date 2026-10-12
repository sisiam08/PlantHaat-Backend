import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiNoContentResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import {
  ApiEnvelopeArrayResponse,
  ApiEnvelopeResponse,
} from "../../common/swagger/api-response.decorators";
import { Role } from "../../generated/prisma/enums";
import { CreateDeliveryZoneDto } from "./dto/create-delivery-zone.dto";
import { DeliveryZoneDto, SellerShopDto } from "./dto/seller-response.dto";
import { SetVacationDto } from "./dto/set-vacation.dto";
import { UpdateDeliveryZoneDto } from "./dto/update-delivery-zone.dto";
import { UpdateShopDto } from "./dto/update-shop.dto";
import { DeliveryService } from "./delivery.service";
import { ShopsService } from "./shops.service";

@ApiTags("Seller shop")
@Roles(Role.SELLER)
@Controller("seller")
export class SellerShopController {
  constructor(
    private readonly shopsService: ShopsService,
    private readonly deliveryService: DeliveryService,
  ) {}

  @Get("shop")
  @ApiOperation({ summary: "Get the seller's shop" })
  @ApiEnvelopeResponse(SellerShopDto)
  getShop(@CurrentUser("id") userId: string) {
    return this.shopsService.getForSeller(userId);
  }

  @Patch("shop")
  @ApiOperation({ summary: "Create or update the seller's shop" })
  @ApiEnvelopeResponse(SellerShopDto)
  upsertShop(@CurrentUser("id") userId: string, @Body() dto: UpdateShopDto) {
    return this.shopsService.upsertForSeller(userId, dto);
  }

  @Post("shop/vacation")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Enable vacation mode" })
  @ApiEnvelopeResponse(SellerShopDto)
  setVacation(@CurrentUser("id") userId: string, @Body() dto: SetVacationDto) {
    return this.shopsService.setVacation(userId, dto);
  }

  @Delete("shop/vacation")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Disable vacation mode" })
  @ApiEnvelopeResponse(SellerShopDto)
  clearVacation(@CurrentUser("id") userId: string) {
    return this.shopsService.clearVacation(userId);
  }

  @Get("delivery-zones")
  @ApiOperation({ summary: "List delivery zones" })
  @ApiEnvelopeArrayResponse(DeliveryZoneDto)
  listZones(@CurrentUser("id") userId: string) {
    return this.deliveryService.listForSeller(userId);
  }

  @Post("delivery-zones")
  @ApiOperation({ summary: "Create a delivery zone" })
  @ApiEnvelopeResponse(DeliveryZoneDto, { status: 201 })
  createZone(@CurrentUser("id") userId: string, @Body() dto: CreateDeliveryZoneDto) {
    return this.deliveryService.create(userId, dto);
  }

  @Patch("delivery-zones/:id")
  @ApiOperation({ summary: "Update a delivery zone" })
  @ApiEnvelopeResponse(DeliveryZoneDto)
  updateZone(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: UpdateDeliveryZoneDto,
  ) {
    return this.deliveryService.update(userId, id, dto);
  }

  @Delete("delivery-zones/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a delivery zone" })
  @ApiNoContentResponse({ description: "Zone deleted" })
  async removeZone(@CurrentUser("id") userId: string, @Param("id") id: string) {
    await this.deliveryService.remove(userId, id);
  }
}
