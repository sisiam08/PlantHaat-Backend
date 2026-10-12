import { ApiProperty } from "@nestjs/swagger";

import { NotificationType } from "../../../generated/prisma/enums";

export class NotificationItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: Object.values(NotificationType) }) type!: NotificationType;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ type: Object, nullable: true }) data!: Record<string, unknown> | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) readAt!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}

export class UnreadCountDto {
  @ApiProperty() count!: number;
}

export class NotificationReadDto {
  @ApiProperty({ example: true }) read!: boolean;
}

export class NotificationReadAllDto {
  @ApiProperty({ example: 3 }) updated!: number;
}
