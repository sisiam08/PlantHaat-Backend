import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Role } from "../../generated/prisma/enums";
import { ComplaintsService } from "./complaints.service";
import { ComplaintCommentDto, QueryComplaintsDto } from "./dto/complaint.dto";

@ApiTags("Seller: complaints")
@Roles(Role.SELLER)
@Controller("seller")
export class SellerComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Get("complaints")
  @ApiOperation({ summary: "List complaints for the seller's shop" })
  list(@CurrentUser("id") sellerUserId: string, @Query() query: QueryComplaintsDto) {
    return this.complaintsService.listForSeller(sellerUserId, query);
  }

  @Get("complaints/:id")
  @ApiOperation({ summary: "Get one of the seller's complaints" })
  get(@CurrentUser("id") sellerUserId: string, @Param("id") id: string) {
    return this.complaintsService.getForSeller(sellerUserId, id);
  }

  @Post("complaints/:id/comments")
  @ApiOperation({ summary: "Respond to a complaint" })
  comment(
    @CurrentUser("id") sellerUserId: string,
    @Param("id") id: string,
    @Body() dto: ComplaintCommentDto,
  ) {
    return this.complaintsService.addSellerComment(sellerUserId, id, dto);
  }
}
