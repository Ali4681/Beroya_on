import { Injectable } from '@nestjs/common';
import { GoRole } from '@/generated/prisma/client';
import { GoErrorCode } from '../errors/go-error-codes';
import { GoException } from '../errors/go.exception';
import type { AuthUser } from './auth-user';
import { BRANCH_OPTIONAL_ROLES, BRANCH_REQUIRED_ROLES, GLOBAL_ROLES } from './roles';

/**
 * Branch Scope (Ticket §1.3, §36): staff only handle records where
 * `record.branch_id == employee.branch_id`, except global roles.
 */
@Injectable()
export class BranchScopeService {
  /** null = unrestricted; string = must equal this branch. */
  scopeOf(user: Pick<AuthUser, 'role' | 'branch_id'>): string | null {
    if (GLOBAL_ROLES.includes(user.role)) return null;
    if (BRANCH_REQUIRED_ROLES.includes(user.role)) {
      if (!user.branch_id) {
        throw new GoException(GoErrorCode.BRANCH_SCOPE_DENIED, 'Account has no branch assigned');
      }
      return user.branch_id;
    }
    if (BRANCH_OPTIONAL_ROLES.includes(user.role)) return user.branch_id ?? null;
    throw new GoException(GoErrorCode.ROLE_NOT_ALLOWED, `Role ${user.role} has no staff scope`);
  }

  isGlobal(user: Pick<AuthUser, 'role' | 'branch_id'>): boolean {
    return this.scopeOf(user) === null;
  }

  /** Throws BRANCH_SCOPE_DENIED unless the user may act on a record of `branchId`. */
  assertAccess(user: Pick<AuthUser, 'role' | 'branch_id'>, branchId: string): void {
    const scope = this.scopeOf(user);
    if (scope !== null && scope !== branchId) {
      throw new GoException(GoErrorCode.BRANCH_SCOPE_DENIED, 'Record belongs to another branch');
    }
  }

  /**
   * Resolve the `branch_id` filter for list endpoints.
   * Scoped users are forced to their branch; asking for another branch is denied.
   * Global users get the requested branch, or `undefined` for all branches.
   */
  resolveFilter(user: Pick<AuthUser, 'role' | 'branch_id'>, requested?: string): string | undefined {
    const scope = this.scopeOf(user);
    if (scope === null) return requested || undefined;
    if (requested && requested !== scope) {
      throw new GoException(GoErrorCode.BRANCH_SCOPE_DENIED, 'Cannot query another branch');
    }
    return scope;
  }

  static requiresBranch(role: GoRole): boolean {
    return BRANCH_REQUIRED_ROLES.includes(role);
  }
}
