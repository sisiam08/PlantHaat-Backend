import { ApiProperty } from "@nestjs/swagger";

export class HomeResponseDto {
  @ApiProperty({ type: [Object], description: "Active hero banners" })
  banners!: Record<string, unknown>[];
  @ApiProperty({ type: [Object], description: "Resolved homepage sections" })
  sections!: Record<string, unknown>[];
}
