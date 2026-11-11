import { GoRole } from '@/generated/prisma/client';

export { GoRole };

export const STAFF_ROLES: readonly GoRole[] = [
  GoRole.CUSTOMER_SERVICE,
  GoRole.CUSTOMER_SERVICE_SUPERVISOR,
  GoRole.OPERATIONS,
  GoRole.WALLET_OPERATOR,
  GoRole.FINANCE,
  GoRole.ADMIN,
  GoRole.SUPER_ADMIN,
];

/** Always restricted to their own branch; must have `branch_id` (Ticket §1.3, §36). */
export const BRANCH_REQUIRED_ROLES: readonly GoRole[] = [
  GoRole.CUSTOMER_SERVICE,
  GoRole.CUSTOMER_SERVICE_SUPERVISOR,
  GoRole.WALLET_OPERATOR,
];

/** Branch-scoped only when the account has a `branch_id`; otherwise global (Ticket §1.3). */
export const BRANCH_OPTIONAL_ROLES: readonly GoRole[] = [GoRole.OPERATIONS, GoRole.FINANCE];

/** Never branch-restricted. */
export const GLOBAL_ROLES: readonly GoRole[] = [GoRole.ADMIN, GoRole.SUPER_ADMIN];

export const ADMIN_ROLES: readonly GoRole[] = [GoRole.ADMIN, GoRole.SUPER_ADMIN];

export const isStaffRole = (role: GoRole) => STAFF_ROLES.includes(role);

/** Password-login (desk) accounts: staff plus store cashiers. Store cashiers get no staff scope or staff endpoints. */
export const DESK_LOGIN_ROLES: readonly GoRole[] = [...STAFF_ROLES, GoRole.STORE_OPERATOR];

export const isDeskLoginRole = (role: GoRole) => DESK_LOGIN_ROLES.includes(role);
