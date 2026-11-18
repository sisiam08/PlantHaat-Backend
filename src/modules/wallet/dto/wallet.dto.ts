import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";
import { PayoutMethod } from "../../../generated/prisma/enums";

export class PayoutProfileDto {
  @ApiProperty({ enum: ["BKASH", "NAGAD", "BANK"] })
  @IsEnum(PayoutMethod)
  method!: PayoutMethod;

  @ApiProperty({ example: "01712345678" })
  @IsString()
  @MinLength(6)
  @MaxLength(34)
  accountNumber!: string;

  @ApiProperty({ example: "Rahim Uddin" })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  accountName!: string;
}

export class WithdrawalRequestDto {
  @ApiProperty({ example: 750 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ enum: PayoutMethod })
  @IsOptional()
  @IsEnum(PayoutMethod)
  method?: PayoutMethod;
}

export class PayWithdrawalDto {
  @ApiProperty({ example: "BKASH-889912" })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  reference!: string;
}

export class RejectWithdrawalDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class QueryWithdrawalsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ["PENDING", "PROCESSING", "PAID", "REJECTED", "FAILED"] })
  @IsOptional()
  @IsString()
  status?: string;
}
