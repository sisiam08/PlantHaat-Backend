import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

export class SetProductStatusDto {
  @ApiProperty({ enum: ["ACTIVE", "INACTIVE"] })
  @IsIn(["ACTIVE", "INACTIVE"])
  status!: "ACTIVE" | "INACTIVE";
}
