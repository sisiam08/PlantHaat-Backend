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
import { AddressDto } from "./dto/address-response.dto";
import {
  ApiEnvelopeArrayResponse,
  ApiEnvelopeResponse,
} from "../../common/swagger/api-response.decorators";
import { AddressesService } from "./addresses.service";
import { CreateAddressDto } from "./dto/create-address.dto";
import { UpdateAddressDto } from "./dto/update-address.dto";

@ApiTags("Addresses")
@Controller("addresses")
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  @ApiOperation({ summary: "List the current user's addresses" })
  @ApiEnvelopeArrayResponse(AddressDto)
  list(@CurrentUser("id") userId: string) {
    return this.addressesService.list(userId);
  }

  @Post()
  @ApiOperation({ summary: "Create an address" })
  @ApiEnvelopeResponse(AddressDto, { status: 201 })
  create(@CurrentUser("id") userId: string, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(userId, dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update an address" })
  @ApiEnvelopeResponse(AddressDto)
  update(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(userId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an address" })
  @ApiNoContentResponse({ description: "Address deleted" })
  async remove(@CurrentUser("id") userId: string, @Param("id") id: string) {
    await this.addressesService.remove(userId, id);
  }

  @Post(":id/default")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark an address as the default" })
  @ApiEnvelopeResponse(AddressDto)
  setDefault(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.addressesService.setDefault(userId, id);
  }
}
