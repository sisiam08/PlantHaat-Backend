import { ApiProperty } from "@nestjs/swagger";

export class RealtimeTicketDto {
  @ApiProperty({
    description: "One-time ticket to authenticate the WebSocket connection",
    example: "eyJuIjoiLi4uIn0....",
  })
  ticket!: string;

  @ApiProperty({ example: 60 })
  expiresInSeconds!: number;

  @ApiProperty({ description: "WebSocket gateway URL", example: "ws://localhost:5000/ws" })
  url!: string | null;
}
