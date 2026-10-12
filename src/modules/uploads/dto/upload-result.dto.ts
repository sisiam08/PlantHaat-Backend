import { ApiProperty } from "@nestjs/swagger";

export class UploadResultDto {
  @ApiProperty({ description: "Object key inside the storage driver" }) key!: string;
  @ApiProperty({
    description: "Public URL (empty for private objects — fetch via the seller/appropriate route)",
  })
  url!: string;
}
