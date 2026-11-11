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
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { GoServiceCode } from '../../../generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Public, Roles } from '../../../common/auth/decorators';
import { ADMIN_ROLES } from '../../../common/auth/roles';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { CreateCategoryDto, PublicCategoryDto, UpdateCategoryDto } from './dto/categories.dto';
import { RideCategoriesService } from './ride-categories.service';

@Controller()
export class RideCategoriesController {
  constructor(private readonly categories: RideCategoriesService) {}

  @Public()
  @Get('customer/ride-categories')
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Active ride categories with pricing, passenger capacity and image (customer app)',
    description:
      'Omit service_type (or DAILY) for standard DAILY vehicle classes. ' +
      'Pass service_type=AMBULANCE for the single ambulance category.',
  })
  @ApiQuery({
    name: 'service_type',
    required: false,
    enum: GoServiceCode,
    description: 'When AMBULANCE, returns only code=AMBULANCE. Default = DAILY classes (excludes AMBULANCE).',
  })
  @ApiOkResponse({ type: [PublicCategoryDto] })
  listCustomer(@Query('service_type') serviceType?: GoServiceCode) {
    return this.categories.listPublic(serviceType);
  }

  @Public()
  @Get('customer/ride-categories/:categoryId/image')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Vehicle image of a ride category (use image_url from the list)' })
  @ApiGoErrors(E.NOT_FOUND)
  async image(@Param('categoryId', ParseUUIDPipe) categoryId: string) {
    const file = await this.categories.readImage(categoryId);
    return new StreamableFile(file.data, { type: file.mime, disposition: 'inline' });
  }

  @Public()
  @Get('driver/ride-categories')
  @ApiTags('Driver')
  @ApiOperation({ summary: 'Active ride categories (driver app)' })
  @ApiOkResponse({ type: [PublicCategoryDto] })
  listDriver() {
    return this.categories.listPublic();
  }

  @ApiBearerAuth()
  @Get('admin/ride-categories')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'All ride categories including inactive' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  listAdmin() {
    return this.categories.listAdmin();
  }

  @ApiBearerAuth()
  @Post('admin/ride-categories')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Create ride category' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.CONFLICT)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCategoryDto) {
    return this.categories.create(user, dto);
  }

  @ApiBearerAuth()
  @Patch('admin/ride-categories/:categoryId')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Update ride category (max_passengers, image upload / remove_image, names, order)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND, E.VALIDATION_ERROR)
  update(
    @CurrentUser() user: AuthUser,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(user, categoryId, dto);
  }

  @ApiBearerAuth()
  @Get('admin/ride-categories/:categoryId')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOkResponse({ description: 'Category with pricing' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND)
  get(@Param('categoryId', ParseUUIDPipe) categoryId: string) {
    return this.categories.get(categoryId);
  }

  @ApiBearerAuth()
  @Delete('admin/ride-categories/:categoryId')
  @HttpCode(HttpStatus.OK)
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({
    summary: 'Delete unused ride category',
    description:
      'Removes the category and its pricing when nothing references it. ' +
      'Returns CONFLICT if rides, vehicles, discounts, or passport rules still use it — deactivate instead.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND, E.CONFLICT)
  remove(@CurrentUser() user: AuthUser, @Param('categoryId', ParseUUIDPipe) categoryId: string) {
    return this.categories.remove(user, categoryId);
  }
}
