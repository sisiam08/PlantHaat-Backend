import { Injectable, Module } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

@Injectable()
export class SearchCacheInvalidator {
  constructor(private readonly search: SearchService) {}

  @OnEvent("product.changed", { async: true })
  @OnEvent("product.moderated", { async: true })
  @OnEvent("seller.approved")
  invalidate(): void {
    this.search.invalidate();
  }
}

@Module({
  providers: [SearchService, SearchCacheInvalidator],
  controllers: [SearchController],
})
export class SearchModule {}
