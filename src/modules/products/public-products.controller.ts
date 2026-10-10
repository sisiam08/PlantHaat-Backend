import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";
import { Public } from "../../common/decorators/public.decorator";
import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from "../../common/swagger/api-response.decorators";
import { HomeResponseDto } from "./dto/home-response.dto";
import { ProductDetailDto, ProductListItemDto } from "./dto/product-response.dto";
import { QueryProductsDto } from "./dto/query-products.dto";
import { ShopDetailDto, ShopListItemDto } from "./dto/shop-response.dto";
import { PublicProductsService } from "./public-products.service";

@ApiTags("Catalog")
@Controller()
export class PublicProductsController {
  constructor(private readonly products: PublicProductsService) {}

  @Public()
  @Get("products")
  @ApiOperation({ summary: "Search/filter public products" })
  @ApiPaginatedResponse(ProductListItemDto)
  list(@Query() query: QueryProductsDto) {
    return this.products.list(query);
  }

  @Public()
  @Get("products/:slug")
  @ApiOperation({ summary: "Get a public product by slug (increments view count)" })
  @ApiEnvelopeResponse(ProductDetailDto)
  get(@Param("slug") slug: string) {
    return this.products.getBySlug(slug);
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
