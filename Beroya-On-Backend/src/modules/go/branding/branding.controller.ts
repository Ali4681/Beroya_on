import { Body, Controller, Get, Header, Param, Patch, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Public, Roles } from '../../../common/auth/decorators';
import { ADMIN_ROLES } from '../../../common/auth/roles';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { Idempotent } from '../../../common/idempotency/idempotent.decorator';
import { BRANDING_APPS } from './branding.constants';
import { BrandingService } from './branding.service';
import { UpdateBrandingDraftDto, UploadBrandingAssetDto } from './dto/branding.dto';

@Controller()
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Public()
  @Get('app/branding')
  @ApiTags('System')
  @ApiQuery({ name: 'app', enum: BRANDING_APPS, required: false, description: 'customer (default) | driver' })
  @ApiOperation({ summary: 'Published app branding for Flutter (per app: customer | driver)' })
  getPublic(@Query('app') app?: string) {
    return this.branding.getPublic(app);
  }

  @Public()
  @Get('app/branding/assets/:slot')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiTags('System')
  @ApiQuery({ name: 'app', enum: BRANDING_APPS, required: false })
  @ApiOperation({ summary: 'Published branding asset stream (per app)' })
  @ApiGoErrors(E.NOT_FOUND, E.VALIDATION_ERROR)
  async getPublicAsset(@Param('slot') slot: string, @Query('app') app?: string) {
    const file = await this.branding.readAsset(slot, 'published', app);
    return new StreamableFile(file.buffer, { type: file.mime, disposition: 'inline' });
  }

  @ApiBearerAuth()
  @Get('admin/config/branding')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiQuery({ name: 'app', enum: BRANDING_APPS, required: false })
  @ApiOperation({ summary: 'Draft + published app branding for one app identity' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR)
  getAdmin(@Query('app') app?: string) {
    return this.branding.getAdmin(app);
  }

  @ApiBearerAuth()
  @Idempotent()
  @Patch('admin/config/branding')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiQuery({ name: 'app', enum: BRANDING_APPS, required: false })
  @ApiOperation({ summary: 'Update branding draft (does not bump version)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.IDEMPOTENCY_KEY_REQUIRED)
  patchDraft(@CurrentUser() user: AuthUser, @Body() dto: UpdateBrandingDraftDto, @Query('app') app?: string) {
    return this.branding.updateDraft(user, dto, app);
  }

  @ApiBearerAuth()
  @Idempotent()
  @Post('admin/config/branding/upload')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiQuery({ name: 'app', enum: BRANDING_APPS, required: false })
  @ApiOperation({ summary: 'Upload a draft branding asset (PNG/JPG/WEBP/GIF/Lottie JSON)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.IDEMPOTENCY_KEY_REQUIRED)
  upload(@CurrentUser() user: AuthUser, @Body() dto: UploadBrandingAssetDto, @Query('app') app?: string) {
    return this.branding.uploadDraft(user, dto, app);
  }

  @ApiBearerAuth()
  @Idempotent()
  @Post('admin/config/branding/publish')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiQuery({ name: 'app', enum: BRANDING_APPS, required: false })
  @ApiOperation({ summary: 'Publish draft branding and increment version for one app' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.IDEMPOTENCY_KEY_REQUIRED)
  publish(@CurrentUser() user: AuthUser, @Query('app') app?: string) {
    return this.branding.publish(user, app);
  }

  @ApiBearerAuth()
  @Get('admin/config/branding/assets/:slot')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiQuery({ name: 'app', enum: BRANDING_APPS, required: false })
  @ApiOperation({ summary: 'Stream draft or published branding asset' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND, E.VALIDATION_ERROR)
  async getAdminAsset(
    @Param('slot') slot: string,
    @Query('layer') layer?: string,
    @Query('app') app?: string,
  ) {
    const file = await this.branding.readAsset(slot, layer === 'published' ? 'published' : 'draft', app);
    return new StreamableFile(file.buffer, { type: file.mime, disposition: 'inline' });
  }
}
