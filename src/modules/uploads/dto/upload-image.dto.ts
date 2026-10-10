import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";

export enum UploadPurpose {
  AVATAR = "avatar",
  PRODUCT = "product",
  SHOP_LOGO = "shop-logo",
  SHOP_BANNER = "shop-banner",
  REVIEW = "review",
  COMPLAINT = "complaint",
  BANNER = "banner",
  CATEGORY = "category",
}

export class UploadImageDto {
  @ApiProperty({ enum: UploadPurpose })
  @IsEnum(UploadPurpose)
  purpose!: UploadPurpose;
}
