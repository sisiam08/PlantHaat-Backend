import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsString, MinLength } from "class-validator";

import { SellerDocumentType } from "../../../generated/prisma/enums";

export class AddDocumentDto {
  @ApiProperty({ enum: SellerDocumentType })
  @IsEnum(SellerDocumentType)
  type!: SellerDocumentType;

  @ApiProperty({ description: "Key returned by POST /uploads/documents" })
  @IsString()
  @MinLength(1)
  fileKey!: string;
}
