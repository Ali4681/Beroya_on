import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Public, Roles } from '../../../common/auth/decorators';
import { ADMIN_ROLES } from '../../../common/auth/roles';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { AdminPackageDto, CreatePackageDto, PublicPackageDto, UpdatePackageDto } from './dto/packages.dto';
import { PackagesService } from './packages.service';

@Controller()
export class PackagesController {
  constructor(private readonly packages: PackagesService) {}

  @Public()
  @Get('customer/packages')
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Active ride packages for the home screen, in display order' })
  @ApiOkResponse({ type: [PublicPackageDto] })
  listCustomer() {
    return this.packages.listPublic();
  }

  @Public()
  @Get('customer/packages/:packageId/image')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Package image (use image_url from the list)' })
  @ApiGoErrors(E.NOT_FOUND)
  async image(@Param('packageId', ParseUUIDPipe) packageId: string) {
    const file = await this.packages.readImage(packageId);
    return new StreamableFile(file.data, { type: file.mime, disposition: 'inline' });
  }

  @ApiBearerAuth()
  @Get('admin/packages')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'All packages including inactive' })
  @ApiOkResponse({ type: [AdminPackageDto] })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  listAdmin() {
    return this.packages.listAdmin();
  }

  @ApiBearerAuth()
  @Get('admin/packages/:packageId')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOkResponse({ type: AdminPackageDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND)
  get(@Param('packageId', ParseUUIDPipe) packageId: string) {
    return this.packages.get(packageId);
  }

  @ApiBearerAuth()
  @Post('admin/packages')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Create package (needs ride_count, discount_percentage, or both)' })
  @ApiOkResponse({ type: AdminPackageDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePackageDto) {
    return this.packages.create(user, dto);
  }

  @ApiBearerAuth()
  @Patch('admin/packages/:packageId')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Update package (fields, image upload / remove_image, order, is_active)' })
  @ApiOkResponse({ type: AdminPackageDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND, E.VALIDATION_ERROR)
  update(
    @CurrentUser() user: AuthUser,
    @Param('packageId', ParseUUIDPipe) packageId: string,
    @Body() dto: UpdatePackageDto,
  ) {
    return this.packages.update(user, packageId, dto);
  }

  @ApiBearerAuth()
  @Delete('admin/packages/:packageId')
  @HttpCode(HttpStatus.OK)
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Delete package and its image' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND)
  remove(@CurrentUser() user: AuthUser, @Param('packageId', ParseUUIDPipe) packageId: string) {
    return this.packages.remove(user, packageId);
  }
}
