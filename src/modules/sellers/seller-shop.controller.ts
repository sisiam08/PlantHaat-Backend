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
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Role } from "../../generated/prisma/enums";
import { CreateDeliveryZoneDto } from "./dto/create-delivery-zone.dto";
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
  getShop(@CurrentUser("id") userId: string) {
    return this.shopsService.getForSeller(userId);
  }

  @Patch("shop")
  @ApiOperation({ summary: "Create or update the seller's shop" })
  upsertShop(@CurrentUser("id") userId: string, @Body() dto: UpdateShopDto) {
    return this.shopsService.upsertForSeller(userId, dto);
  }

  @Post("shop/vacation")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Enable vacation mode" })
  setVacation(@CurrentUser("id") userId: string, @Body() dto: SetVacationDto) {
    return this.shopsService.setVacation(userId, dto);
  }

  @Delete("shop/vacation")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Disable vacation mode" })
  clearVacation(@CurrentUser("id") userId: string) {
    return this.shopsService.clearVacation(userId);
  }

  @Get("delivery-zones")
  @ApiOperation({ summary: "List delivery zones" })
  listZones(@CurrentUser("id") userId: string) {
    return this.deliveryService.listForSeller(userId);
  }

  @Post("delivery-zones")
  @ApiOperation({ summary: "Create a delivery zone" })
  createZone(@CurrentUser("id") userId: string, @Body() dto: CreateDeliveryZoneDto) {
    return this.deliveryService.create(userId, dto);
  }

  @Patch("delivery-zones/:id")
  @ApiOperation({ summary: "Update a delivery zone" })
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
  async removeZone(@CurrentUser("id") userId: string, @Param("id") id: string) {
    await this.deliveryService.remove(userId, id);
  }
}
