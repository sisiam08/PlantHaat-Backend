import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Role } from "../../generated/prisma/enums";
import { ComplaintsService } from "./complaints.service";
import { ComplaintCommentDto, CreateComplaintDto, QueryComplaintsDto } from "./dto/complaint.dto";

@ApiTags("Complaints")
@Roles(Role.CUSTOMER)
@Controller("complaints")
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Get()
  @ApiOperation({ summary: "List the customer's complaints" })
  list(@CurrentUser("id") customerId: string, @Query() query: QueryComplaintsDto) {
    return this.complaintsService.listMine(customerId, query);
  }

  @Post()
  @ApiOperation({ summary: "Open a complaint" })
  create(@CurrentUser("id") customerId: string, @Body() dto: CreateComplaintDto) {
    return this.complaintsService.create(customerId, dto);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get one of the customer's complaints" })
  get(@CurrentUser("id") customerId: string, @Param("id") id: string) {
    return this.complaintsService.getForCustomer(customerId, id);
  }

  @Post(":id/comments")
  @ApiOperation({ summary: "Add a comment to a complaint" })
  comment(
    @CurrentUser("id") customerId: string,
    @Param("id") id: string,
    @Body() dto: ComplaintCommentDto,
  ) {
    return this.complaintsService.addCustomerComment(customerId, id, dto);
  }
}
