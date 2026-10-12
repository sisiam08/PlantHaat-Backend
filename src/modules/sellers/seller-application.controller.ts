import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiNoContentResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import {
  ApiEnvelopeArrayResponse,
  ApiEnvelopeResponse,
} from "../../common/swagger/api-response.decorators";
import { Role } from "../../generated/prisma/enums";
import { AddDocumentDto } from "./dto/add-document.dto";
import { CreatePayoutAccountDto } from "./dto/create-payout-account.dto";
import {
  SellerApplicationDto,
  SellerDocumentDto,
  SellerPayoutAccountDto,
} from "./dto/seller-response.dto";
import { UpdateApplicationDto } from "./dto/update-application.dto";
import { SellersService } from "./sellers.service";

@ApiTags("Seller onboarding")
@Roles(Role.SELLER)
@Controller("seller")
export class SellerApplicationController {
  constructor(private readonly sellersService: SellersService) {}

  @Get("application")
  @ApiOperation({ summary: "Get the seller application" })
  @ApiEnvelopeResponse(SellerApplicationDto)
  getApplication(@CurrentUser("id") userId: string) {
    return this.sellersService.getApplication(userId);
  }

  @Patch("application")
  @ApiOperation({ summary: "Update the seller application" })
  @ApiEnvelopeResponse(SellerApplicationDto)
  updateApplication(@CurrentUser("id") userId: string, @Body() dto: UpdateApplicationDto) {
    return this.sellersService.updateApplication(userId, dto);
  }

  @Post("application/documents")
  @ApiOperation({ summary: "Attach an uploaded document to the application" })
  @ApiEnvelopeResponse(SellerDocumentDto, { status: 201 })
  addDocument(@CurrentUser("id") userId: string, @Body() dto: AddDocumentDto) {
    return this.sellersService.addDocument(userId, dto);
  }

  @Delete("application/documents/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a document from the application" })
  @ApiNoContentResponse({ description: "Document removed" })
  async removeDocument(@CurrentUser("id") userId: string, @Param("id") id: string) {
    await this.sellersService.removeDocument(userId, id);
  }

  @Post("application/submit")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Submit the application for admin review" })
  @ApiEnvelopeResponse(SellerApplicationDto)
  submit(@CurrentUser("id") userId: string) {
    return this.sellersService.submitApplication(userId);
  }

  @Get("payout-accounts")
  @ApiOperation({ summary: "List payout accounts (masked)" })
  @ApiEnvelopeArrayResponse(SellerPayoutAccountDto)
  listPayoutAccounts(@CurrentUser("id") userId: string) {
    return this.sellersService.listPayoutAccounts(userId);
  }

  @Post("payout-accounts")
  @ApiOperation({ summary: "Add a payout account (number encrypted at rest)" })
  @ApiEnvelopeResponse(SellerPayoutAccountDto, { status: 201 })
  createPayoutAccount(@CurrentUser("id") userId: string, @Body() dto: CreatePayoutAccountDto) {
    return this.sellersService.createPayoutAccount(userId, dto);
  }

  @Delete("payout-accounts/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a payout account" })
  @ApiNoContentResponse({ description: "Payout account removed" })
  async removePayoutAccount(@CurrentUser("id") userId: string, @Param("id") id: string) {
    await this.sellersService.removePayoutAccount(userId, id);
  }
}
