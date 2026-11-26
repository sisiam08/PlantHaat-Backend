import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from "class-validator";

import { BD_MOBILE_MESSAGE, BD_MOBILE_REGEX } from "../../../common/validators/payout-destination";

export { ADVANCE_PROVIDERS, type AdvanceProvider } from "../advance-providers";
import { ADVANCE_PROVIDERS, type AdvanceProvider } from "../advance-providers";

export class CreatePaymentSubmissionDto {
  @ApiProperty({ enum: ADVANCE_PROVIDERS })
  @IsIn(ADVANCE_PROVIDERS)
  provider!: AdvanceProvider;

  @ApiProperty({ example: "9F7K2M1Q" })
  @IsString()
  @MinLength(6)
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9]+$/, { message: "Transaction ID must be letters and digits only" })
  trxId!: string;

  @ApiProperty({ example: "01700000000" })
  @Matches(BD_MOBILE_REGEX, { message: BD_MOBILE_MESSAGE })
  senderNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  proofUrl?: string;
}

export class VerifyPaymentDto {
  @ApiProperty({ example: 1970 })
  @Type(() => Number)
  @Min(0.01)
  amountReceived!: number;
}

export class RejectPaymentDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}

export class CompleteRefundDto {
  @ApiProperty({ example: "BKASHREF1234" })
  @IsString()
  @MinLength(4)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9]+$/, { message: "Refund transaction ID must be letters and digits only" })
  refundTrxId!: string;
}
