import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from "../../common/swagger/api-response.decorators";
import { Role } from "../../generated/prisma/enums";
import { ComplaintsService } from "./complaints.service";
import {
  AdminComplaintListItemDto,
  ComplaintCommentResponseDto,
  CustomerComplaintDetailDto,
  SellerComplaintDetailDto,
} from "./dto/complaint-response.dto";
import { ComplaintCommentDto, CreateComplaintDto, QueryComplaintsDto } from "./dto/complaint.dto";

@ApiTags("Complaints")
@Roles(Role.CUSTOMER)
@Controller("complaints")
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Get()
  @ApiOperation({ summary: "List the customer's complaints" })
  @ApiPaginatedResponse(AdminComplaintListItemDto)
  list(@CurrentUser("id") customerId: string, @Query() query: QueryComplaintsDto) {
    return this.complaintsService.listMine(customerId, query);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @ApiOperation({ summary: "Open a complaint" })
  @ApiEnvelopeResponse(SellerComplaintDetailDto, { status: 201 })
  create(@CurrentUser("id") customerId: string, @Body() dto: CreateComplaintDto) {
    return this.complaintsService.create(customerId, dto);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get one of the customer's complaints" })
  @ApiEnvelopeResponse(CustomerComplaintDetailDto)
  get(@CurrentUser("id") customerId: string, @Param("id") id: string) {
    return this.complaintsService.getForCustomer(customerId, id);
  }

  @Post(":id/comments")
  @ApiOperation({ summary: "Add a comment to a complaint" })
  @ApiEnvelopeResponse(ComplaintCommentResponseDto, { status: 201 })
  comment(
    @CurrentUser("id") customerId: string,
    @Param("id") id: string,
    @Body() dto: ComplaintCommentDto,
  ) {
    return this.complaintsService.addCustomerComment(customerId, id, dto);
  }
}
