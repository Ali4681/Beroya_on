import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Public, Roles } from '../../../common/auth/decorators';
import { ADMIN_ROLES } from '../../../common/auth/roles';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { Idempotent } from '../../../common/idempotency/idempotent.decorator';
import { BRANDING_APPS } from '../branding/branding.constants';
import { GoConfigService } from './config.service';
import { UpdateAppInfoDto } from './dto/app-info.dto';

@Controller()
export class AppInfoController {
  constructor(private readonly config: GoConfigService) {}

  @Public()
  @Get('app/info')
  @ApiTags('System')
  @ApiQuery({ name: 'app', enum: BRANDING_APPS, required: false, description: 'customer (default) | driver' })
  @ApiOperation({
    summary: 'Public app info (support, legal links, versions) — per app identity',
    description:
      'No auth. Used for Account support contacts, Terms/Privacy, About, and force-update checks. ' +
      'Pass ?app=customer|driver (defaults to customer). Editable via PATCH /admin/config/app-info?app=…',
  })
  getPublic(@Query('app') app?: string) {
    return this.config.getAppInfoPublic(app);
  }

  @ApiBearerAuth()
  @Get('admin/config/app-info')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiQuery({ name: 'app', enum: BRANDING_APPS, required: false })
  @ApiOperation({ summary: 'Get app info for one identity (dashboard)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR)
  getAdmin(@Query('app') app?: string) {
    return this.config.getAppInfoAdmin(app);
  }

  @ApiBearerAuth()
  @Idempotent()
  @Patch('admin/config/app-info')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiQuery({ name: 'app', enum: BRANDING_APPS, required: false })
  @ApiOperation({ summary: 'Update app info (support, legal, versions) for one identity' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.IDEMPOTENCY_KEY_REQUIRED)
  patch(@CurrentUser() user: AuthUser, @Body() dto: UpdateAppInfoDto, @Query('app') app?: string) {
    return this.config.updateAppInfo(user, dto, app);
  }
}
