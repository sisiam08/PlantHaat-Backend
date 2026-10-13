import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../common/decorators/public.decorator";
import { ApiEnvelopeResponse } from "../../common/swagger/api-response.decorators";
import { SearchSuggestDto } from "./dto/search-suggest-response.dto";
import { SearchSuggestQueryDto } from "./dto/search-suggest-query.dto";
import { SearchService } from "./search.service";

@ApiTags("Search")
@Controller("search")
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Public()
  @Get("suggest")
  @Throttle({ default: { limit: 60, ttl: 60 * 1000 } })
  @ApiOperation({
    summary: "Typo-tolerant suggestions for the header search box",
    description:
      "Returns up to 4 products, 2 categories and 2 shops. Matching: name/nameBn/" +
      "scientificName/tags ILIKE prefix + pg_trgm similarity/word_similarity; " +
      "prefix matches rank first; only visible products; in-stock preferred; " +
      "Bangla and English both work. `q` is trimmed and must be 2–50 characters.",
  })
  @ApiEnvelopeResponse(SearchSuggestDto)
  suggest(@Query() query: SearchSuggestQueryDto) {
    return this.search.suggest(query);
  }
}
