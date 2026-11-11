import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Public, Roles } from '../../../common/auth/decorators';
import { ADMIN_ROLES } from '../../../common/auth/roles';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { CitiesService } from './cities.service';
import { AdminCityDto, CreateCityDto, PublicCityDto, UpdateCityDto } from './dto/cities.dto';

@Controller()
export class CitiesController {
  constructor(private readonly cities: CitiesService) {}

  @Public()
  @Get('customer/cities')
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Active cities for signup / profile (public)',
    description:
      'Returns { items: [{ id, name_ar, name_en, lat, lng }] } ordered by sort_order then name_ar. lat/lng are city centroids for INTERCITY.',
  })
  @ApiOkResponse({ type: [PublicCityDto] })
  listPublic() {
    return this.cities.listPublic();
  }

  @ApiBearerAuth()
  @Get('admin/cities')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'All cities including inactive' })
  @ApiOkResponse({ type: [AdminCityDto] })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  listAdmin() {
    return this.cities.listAdmin();
  }

  @ApiBearerAuth()
  @Post('admin/cities')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Create city' })
  @ApiOkResponse({ type: AdminCityDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCityDto) {
    return this.cities.create(user, dto);
  }

  @ApiBearerAuth()
  @Patch('admin/cities/:cityId')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Update city (name, order, activate/deactivate)' })
  @ApiOkResponse({ type: AdminCityDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND, E.VALIDATION_ERROR)
  update(
    @CurrentUser() user: AuthUser,
    @Param('cityId', ParseUUIDPipe) cityId: string,
    @Body() dto: UpdateCityDto,
  ) {
    return this.cities.update(user, cityId, dto);
  }
}
