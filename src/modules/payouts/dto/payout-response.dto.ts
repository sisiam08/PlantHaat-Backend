import { ApiProperty } from "@nestjs/swagger";

import { SellerLedgerEntryDto, SellerPayoutDto } from "../../analytics/dto/analytics-response.dto";

export { SellerLedgerEntryDto, SellerPayoutDto };

export class SellerBalanceDto {
  @ApiProperty({ type: String, description: "Ledger balance as a decimal string (positive = owed to seller)" })
  balance!: string;
}

export class SellerBalancesDto {
  @ApiProperty({ type: String, description: "Held positive entries (not yet unlocked)" })
  pending!: string;
  @ApiProperty({ type: String, description: "Payout-able amount (unlocked positive minus negative entries)" })
  available!: string;
  @ApiProperty({ type: String, description: "Amount the seller owes the platform (when available < 0)" })
  owedToPlatform!: string;
  @ApiProperty({ type: String, description: "pending + available (total ledger sum)" })
  net!: string;
}
