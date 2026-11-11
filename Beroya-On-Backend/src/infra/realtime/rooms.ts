import { GoRole } from '@/generated/prisma/client';

/** Socket.IO room naming. Every socket joins `user:{id}`; staff also join branch/role rooms. */
export const Rooms = {
  user: (userId: string) => `user:${userId}`,
  branch: (branchId: string) => `branch:${branchId}`,
  branchRole: (branchId: string, role: GoRole) => `branch:${branchId}:role:${role}`,
  staffGlobal: () => 'staff:global',
  globalRole: (role: GoRole) => `global:role:${role}`,
  ride: (rideId: string) => `ride:${rideId}`,
};

export const NAMESPACES = {
  CUSTOMER: '/go/customer',
  DRIVER: '/go/driver',
  STAFF: '/go/staff',
  EMERGENCY_AUDIO: '/go/emergency-audio',
} as const;
