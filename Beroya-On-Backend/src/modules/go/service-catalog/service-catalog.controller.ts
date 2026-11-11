import { Body, Controller, Get, Header, Param, ParseEnumPipe, Patch, Put, Req, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GoServiceCode } from '@/generated/prisma/client';
import type { Request } from 'express';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Public, Roles } from '../../../common/auth/decorators';
import { ADMIN_ROLES } from '../../../common/auth/roles';
import { TokenVerifier } from '../../../common/auth/token-verifier.service';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { AdminServiceDto, PublicServiceDto, ReorderServicesDto, UpdateServiceDto } from './dto/service-catalog.dto';
import { ServiceCatalogService } from './service-catalog.service';

@Controller()
export class ServiceCatalogController {
  constructor(
    private readonly catalog: ServiceCatalogService,
    private readonly tokens: TokenVerifier,
  ) {}

  @Public()
  @Get('customer/services')
  @Header('Cache-Control', 'private, no-store')
  @ApiTags('Customer')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Home services in display order',
    description:
      'No login needed. Send the customer bearer token to get personal DISCOUNT badges; ' +
      'without it (or with an invalid one) only admin PROMOTION badges are returned.',
  })
  @ApiOkResponse({ type: [PublicServiceDto] })
  async listCustomer(@Req() req: Request) {
    return this.catalog.listForCustomer(await this.optionalUser(req));
  }

  @Public()
  @Get('customer/services/:code/image')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Service image (use image_url from the list)' })
  @ApiGoErrors(E.NOT_FOUND)
  async image(@Param('code', new ParseEnumPipe(GoServiceCode)) code: GoServiceCode) {
    const file = await this.catalog.readImage(code);
    return new StreamableFile(file.data, { type: file.mime, disposition: 'inline' });
  }

  @ApiBearerAuth()
  @Get('admin/services')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'All services including hidden ones' })
  @ApiOkResponse({ type: [AdminServiceDto] })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  listAdmin() {
    return this.catalog.listAdmin();
  }

  @ApiBearerAuth()
  @Put('admin/services/order')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Set display order (every code once)' })
  @ApiOkResponse({ type: [AdminServiceDto] })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR)
  reorder(@CurrentUser() user: AuthUser, @Body() dto: ReorderServicesDto) {
    return this.catalog.reorder(user, dto);
  }

  @ApiBearerAuth()
  @Patch('admin/services/:code')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Update name, image, availability, visibility, order, or promotion badge' })
  @ApiOkResponse({ type: AdminServiceDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND, E.VALIDATION_ERROR)
  update(
    @CurrentUser() user: AuthUser,
    @Param('code', new ParseEnumPipe(GoServiceCode)) code: GoServiceCode,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.catalog.update(user, code, dto);
  }

  private async optionalUser(req: Request): Promise<AuthUser | null> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    return this.tokens.verify(header.slice(7).trim()).catch(() => null);
  }
}
