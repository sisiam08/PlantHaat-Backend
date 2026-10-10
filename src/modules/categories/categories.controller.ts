import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { Public } from "../../common/decorators/public.decorator";
import { CategoriesService } from "./categories.service";

@ApiTags("Categories")
@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Get the active category tree (two levels)" })
  getTree() {
    return this.categoriesService.getTree();
  }
}
