import { GoRole } from '@/generated/prisma/client';

/** Shape of `request.user` after JwtAuthGuard. */
export interface AuthUser {
  id: string;
  role: GoRole;
  branch_id: string | null;
  session_id: string;
}

export interface AccessTokenPayload {
  sub: string;
  role: GoRole;
  branch_id: string | null;
  sid: string;
}
