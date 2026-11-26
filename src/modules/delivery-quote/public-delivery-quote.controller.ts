import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { Public } from "../../common/decorators/public.decorator";
import { DeliveryQuoteService } from "./delivery-quote.service";
import { PreviewQuoteDto } from "./preview-quote.dto";

@ApiTags("Delivery quote")
@Controller("delivery-quote")
export class PublicDeliveryQuoteController {
  constructor(private readonly quotes: DeliveryQuoteService) {}

  @Public()
  @Post("preview")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Preview courier charges for guest cart lines (district/thana + shop variants only)",
  })
  preview(@Body() dto: PreviewQuoteDto) {
    return this.quotes.previewGuest(dto);
  }
}
