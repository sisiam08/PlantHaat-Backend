import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { Public } from "../../common/decorators/public.decorator";
import { ApiEnvelopeArrayResponse } from "../../common/swagger/api-response.decorators";
import { CategoriesService } from "./categories.service";
import { CategoryNodeDto } from "./dto/category-node.dto";

@ApiTags("Categories")
@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Get the active category tree (two levels)" })
  @ApiEnvelopeArrayResponse(CategoryNodeDto)
  getTree() {
    return this.categoriesService.getTree();
  }
}
