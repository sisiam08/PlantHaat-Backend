import { ApiProperty } from "@nestjs/swagger";

import { AnnouncementAudience } from "../../../generated/prisma/enums";

export class AnnouncementDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ enum: Object.values(AnnouncementAudience) })
  audience!: AnnouncementAudience;
  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  publishedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  expiresAt!: string | null;
  @ApiProperty() createdById!: string;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
}
