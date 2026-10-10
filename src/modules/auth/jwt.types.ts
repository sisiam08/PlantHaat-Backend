import type { Role } from "../../generated/prisma/enums";

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  sid: string;
}
