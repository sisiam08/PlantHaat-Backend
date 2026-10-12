import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from "@nestjs/common";
import { ApiNoContentResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";

import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";
import { Public } from "../../common/decorators/public.decorator";
import {
  ApiAdaptivePaginatedResponse,
  ApiEnvelopeArrayResponse,
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from "../../common/swagger/api-response.decorators";
import { DeliveryQuoteDto } from "./dto/delivery-quote-response.dto";
import { HomeResponseDto } from "./dto/home-response.dto";
import { ProductDetailDto, ProductListItemDto } from "./dto/product-response.dto";
import { QueryProductsDto } from "./dto/query-products.dto";
import { DeliveryQuoteQueryDto } from "./dto/delivery-quote-query.dto";
import { RelatedProductsQueryDto } from "./dto/related-products.dto";
import { ShopDetailDto, ShopListItemDto } from "./dto/shop-response.dto";
import { ProductViewsService } from "./product-views.service";
import { PublicProductsService } from "./public-products.service";

@ApiTags("Catalog")
@Controller()
export class PublicProductsController {
  constructor(
    private readonly products: PublicProductsService,
    private readonly views: ProductViewsService,
  ) {}

  @Public()
  @Get("products")
  @ApiOperation({
    summary: "Search/filter public products",
    description:
      "Default sorts return page-based meta (`page/limit/total/totalPages`). " +
      "`sort=random` returns cursor meta (`limit/nextCursor/hasMore`) with no total; " +
      "pass `seed` (1–64 chars `[A-Za-z0-9_-]`) for a stable shuffle and `cursor` to page.",
  })
  @ApiAdaptivePaginatedResponse(ProductListItemDto)
  list(@Query() query: QueryProductsDto) {
    return this.products.list(query);
  }

  @Public()
  @Get("products/:slug/related")
  @ApiOperation({ summary: "Related products for a product (same category first)" })
  @ApiEnvelopeArrayResponse(ProductListItemDto)
  related(@Param("slug") slug: string, @Query() query: RelatedProductsQueryDto) {
    return this.products.getRelated(slug, query.limit ?? 6);
  }

  @Public()
  @Get("products/:slug")
  @ApiOperation({ summary: "Get a public product by slug (increments view count)" })
  @ApiEnvelopeResponse(ProductDetailDto)
  get(@Param("slug") slug: string) {
    return this.products.getBySlug(slug);
  }

  @Public()
  @Post("products/:id/view")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 60, ttl: 60 * 1000 } })
  @ApiOperation({ summary: "Record a product view (deduplicated per IP, 30-minute window)" })
  @ApiNoContentResponse({ description: "View recorded (or deduplicated)" })
  recordView(@Param("id") id: string, @Req() request: Request): void {
    this.views.record(id, (request as Request & { clientIp?: string }).clientIp);
  }

  @Public()
  @Get("shops")
  @ApiOperation({ summary: "List public shops" })
  @ApiPaginatedResponse(ShopListItemDto)
  listShops(@Query() query: PaginationQueryDto) {
    return this.products.listShops(query);
  }

  @Public()
  @Get("shops/:slug")
  @ApiOperation({ summary: "Get a public shop by slug" })
  @ApiEnvelopeResponse(ShopDetailDto)
  getShop(@Param("slug") slug: string) {
    return this.products.getShopBySlug(slug);
  }

  @Public()
  @Get("shops/:slug/delivery-quote")
  @ApiOperation({
    summary: "Delivery quote for a shop + destination district (same zones as checkout)",
  })
  @ApiEnvelopeResponse(DeliveryQuoteDto)
  deliveryQuote(@Param("slug") slug: string, @Query() query: DeliveryQuoteQueryDto) {
    return this.products.getDeliveryQuote(slug, query.districtId);
  }

  @Public()
  @Get("shops/:slug/products")
  @ApiOperation({ summary: "List a shop's public products" })
  @ApiPaginatedResponse(ProductListItemDto)
  shopProducts(@Param("slug") slug: string, @Query() query: QueryProductsDto) {
    return this.products.listShopProducts(slug, query);
  }

  @Public()
  @Get("home")
  @ApiOperation({ summary: "Resolved homepage (banners + sections)" })
  @ApiEnvelopeResponse(HomeResponseDto)
  home() {
    return this.products.getHome();
  }
}
