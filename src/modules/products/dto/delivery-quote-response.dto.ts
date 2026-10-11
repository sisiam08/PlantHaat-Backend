import { ApiProperty } from "@nestjs/swagger";

export class DeliveryQuoteDto {
  @ApiProperty() deliverable!: boolean;
  @ApiProperty({
    nullable: true,
    type: String,
    description: "Delivery charge as a decimal string; null when not deliverable",
  })
  charge!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: "Free-delivery threshold as a decimal string; null when none",
  })
  freeDeliveryAbove!: string | null;
  @ApiProperty({ nullable: true, type: Number }) estimatedDaysMin!: number | null;
  @ApiProperty({ nullable: true, type: Number }) estimatedDaysMax!: number | null;
  @ApiProperty({ nullable: true, type: String, description: "Matched delivery zone name" })
  zoneName!: string | null;
  @ApiProperty() codAvailable!: boolean;
}
