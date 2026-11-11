import { ConnectedSocket, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { GoRole } from '@/generated/prisma/client';
import { BranchScopeService } from '../../common/auth/branch-scope.service';
import { TokenVerifier } from '../../common/auth/token-verifier.service';
import { STAFF_ROLES } from '../../common/auth/roles';
import { BaseGoGateway, GoSocket } from './base.gateway';
import { RealtimeService } from './realtime.service';
import { NAMESPACES } from './rooms';

@WebSocketGateway({ namespace: NAMESPACES.CUSTOMER })
export class CustomerGateway extends BaseGoGateway {
  protected readonly allowedRoles = [GoRole.CUSTOMER];
  protected readonly namespaceKey = 'customer' as const;

  constructor(verifier: TokenVerifier, branchScope: BranchScopeService, realtime: RealtimeService) {
    super(verifier, branchScope, realtime);
  }

  @SubscribeMessage('system.ping')
  ping(@ConnectedSocket() socket: GoSocket) {
    return this.pong(socket);
  }
}

@WebSocketGateway({ namespace: NAMESPACES.DRIVER })
export class DriverGateway extends BaseGoGateway {
  protected readonly allowedRoles = [GoRole.DRIVER];
  protected readonly namespaceKey = 'driver' as const;

  constructor(verifier: TokenVerifier, branchScope: BranchScopeService, realtime: RealtimeService) {
    super(verifier, branchScope, realtime);
  }

  @SubscribeMessage('system.ping')
  ping(@ConnectedSocket() socket: GoSocket) {
    return this.pong(socket);
  }
}

@WebSocketGateway({ namespace: NAMESPACES.STAFF })
export class StaffGateway extends BaseGoGateway {
  protected readonly allowedRoles = STAFF_ROLES;
  protected readonly namespaceKey = 'staff' as const;

  constructor(verifier: TokenVerifier, branchScope: BranchScopeService, realtime: RealtimeService) {
    super(verifier, branchScope, realtime);
  }

  @SubscribeMessage('system.ping')
  ping(@ConnectedSocket() socket: GoSocket) {
    return this.pong(socket);
  }
}
