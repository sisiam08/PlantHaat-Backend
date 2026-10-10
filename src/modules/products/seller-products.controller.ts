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
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { SellerApprovedGuard } from "../../common/guards/seller-approved.guard";
import { Role } from "../../generated/prisma/enums";
import { AdjustStockDto } from "./dto/adjust-stock.dto";
import { CreateProductDto } from "./dto/create-product.dto";
import { CreateVariantDto } from "./dto/create-variant.dto";
import { CreateProductImageDto, UpdateProductImageDto } from "./dto/product-image.dto";
import { SetProductStatusDto } from "./dto/set-product-status.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { UpdateVariantDto } from "./dto/update-variant.dto";
import { SellerProductsService } from "./seller-products.service";

@ApiTags("Seller: products")
@Roles(Role.SELLER)
@UseGuards(SellerApprovedGuard)
@Controller("seller")
export class SellerProductsController {
  constructor(private readonly productsService: SellerProductsService) {}

  @Get("products")
  @ApiOperation({ summary: "List the seller's products" })
  list(@CurrentUser("id") userId: string) {
    return this.productsService.list(userId);
  }

  @Post("products")
  @ApiOperation({ summary: "Create a product (starts as DRAFT)" })
  create(@CurrentUser("id") userId: string, @Body() dto: CreateProductDto) {
    return this.productsService.create(userId, dto);
  }

  @Get("products/:id")
  @ApiOperation({ summary: "Get one of the seller's products" })
  get(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.productsService.get(userId, id);
  }

  @Patch("products/:id")
  @ApiOperation({ summary: "Update a product" })
  update(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(userId, id, dto);
  }

  @Delete("products/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete a product" })
  async remove(@CurrentUser("id") userId: string, @Param("id") id: string) {
    await this.productsService.remove(userId, id);
  }

  @Post("products/:id/status")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Activate/submit or deactivate a product" })
  setStatus(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: SetProductStatusDto,
  ) {
    return this.productsService.setStatus(userId, id, dto);
  }

  @Post("products/:id/variants")
  @ApiOperation({ summary: "Add a variant" })
  addVariant(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.productsService.addVariant(userId, id, dto);
  }

  @Patch("products/:id/variants/:variantId")
  @ApiOperation({ summary: "Update a variant" })
  updateVariant(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Param("variantId") variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.productsService.updateVariant(userId, id, variantId, dto);
  }

  @Delete("products/:id/variants/:variantId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a variant" })
  async deleteVariant(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Param("variantId") variantId: string,
  ) {
    await this.productsService.deleteVariant(userId, id, variantId);
  }

  @Post("variants/:variantId/stock")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Adjust stock (delta or set) and log the change" })
  adjustStock(
    @CurrentUser("id") userId: string,
    @Param("variantId") variantId: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.productsService.adjustStock(userId, variantId, dto);
  }

  @Post("products/:id/images")
  @ApiOperation({ summary: "Add a product image" })
  addImage(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: CreateProductImageDto,
  ) {
    return this.productsService.addImage(userId, id, dto);
  }

  @Patch("products/:id/images/:imageId")
  @ApiOperation({ summary: "Update a product image" })
  updateImage(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Param("imageId") imageId: string,
    @Body() dto: UpdateProductImageDto,
  ) {
    return this.productsService.updateImage(userId, id, imageId, dto);
  }

  @Delete("products/:id/images/:imageId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete a product image" })
  deleteImage(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Param("imageId") imageId: string,
  ) {
    return this.productsService.deleteImage(userId, id, imageId);
  }
}
