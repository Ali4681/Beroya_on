import { GoRole } from '@/generated/prisma/client';
import { GoErrorCode } from '../errors/go-error-codes';
import { GoException } from '../errors/go.exception';
import { BranchScopeService } from './branch-scope.service';

describe('BranchScopeService', () => {
  const svc = new BranchScopeService();

  it('SUPER_ADMIN/ADMIN are global', () => {
    expect(svc.scopeOf({ role: GoRole.SUPER_ADMIN, branch_id: null })).toBeNull();
    expect(svc.scopeOf({ role: GoRole.ADMIN, branch_id: 'b1' })).toBeNull();
  });

  it('CS must have a branch', () => {
    expect(() => svc.scopeOf({ role: GoRole.CUSTOMER_SERVICE, branch_id: null })).toThrow(GoException);
    expect(svc.scopeOf({ role: GoRole.CUSTOMER_SERVICE, branch_id: 'b1' })).toBe('b1');
  });

  it('OPERATIONS without branch is global; with branch is scoped', () => {
    expect(svc.scopeOf({ role: GoRole.OPERATIONS, branch_id: null })).toBeNull();
    expect(svc.scopeOf({ role: GoRole.OPERATIONS, branch_id: 'b2' })).toBe('b2');
  });

  it('assertAccess denies other branches', () => {
    try {
      svc.assertAccess({ role: GoRole.CUSTOMER_SERVICE, branch_id: 'b1' }, 'b2');
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(GoException);
      expect((e as GoException).code).toBe(GoErrorCode.BRANCH_SCOPE_DENIED);
    }
  });

  it('resolveFilter forces scoped branch', () => {
    expect(svc.resolveFilter({ role: GoRole.CUSTOMER_SERVICE, branch_id: 'b1' })).toBe('b1');
    expect(svc.resolveFilter({ role: GoRole.SUPER_ADMIN, branch_id: null }, 'b9')).toBe('b9');
  });
});
