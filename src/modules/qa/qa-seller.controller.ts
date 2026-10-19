import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { ApiCursorPaginatedResponse } from "../../common/swagger/api-response.decorators";
import { Role } from "../../generated/prisma/enums";
import { QuerySellerQuestionsDto } from "./dto/qa.dto";
import { SellerQuestionDto } from "./dto/qa-response.dto";
import { QaService } from "./qa.service";

@ApiTags("Seller: Q&A")
@Roles(Role.SELLER)
@Controller("seller")
export class QaSellerController {
  constructor(private readonly qa: QaService) {}

  @Get("questions")
  @ApiOperation({ summary: "Questions for the seller's products (unanswered|all)" })
  @ApiCursorPaginatedResponse(SellerQuestionDto)
  list(@CurrentUser("id") sellerUserId: string, @Query() query: QuerySellerQuestionsDto) {
    return this.qa.listSellerQuestions(sellerUserId, query);
  }
}
