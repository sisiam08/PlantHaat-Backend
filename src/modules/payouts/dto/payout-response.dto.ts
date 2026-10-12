import { ApiProperty } from "@nestjs/swagger";

import { SellerLedgerEntryDto, SellerPayoutDto } from "../../analytics/dto/analytics-response.dto";

export { SellerLedgerEntryDto, SellerPayoutDto };

export class SellerBalanceDto {
  @ApiProperty({ type: String, description: "Ledger balance as a decimal string (positive = owed to seller)" })
  balance!: string;
}
