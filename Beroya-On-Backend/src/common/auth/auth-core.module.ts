import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import type { AppConfig } from '../../config/configuration';
import { BranchScopeService } from './branch-scope.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { TokenVerifier } from './token-verifier.service';

/** Global auth primitives: JWT, TokenVerifier, BranchScope, and global guards (JWT then Roles). */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { jwt } = config.getOrThrow<AppConfig>('app');
        return {
          secret: jwt.accessSecret,
          signOptions: { expiresIn: jwt.accessTtl as unknown as number },
        };
      },
    }),
  ],
  providers: [
    TokenVerifier,
    BranchScopeService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [JwtModule, TokenVerifier, BranchScopeService],
})
export class AuthCoreModule {}
