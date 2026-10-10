import type { Role } from "../../generated/prisma/enums";

export interface AuthenticatedUser {
  id: string;
  role: Role;
  sessionId: string;
  email: string;
}
