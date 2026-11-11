import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GoRole } from '@/generated/prisma/client';
import type { Response } from 'express';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { CreateSavedPlaceDto, UpdateSavedPlaceDto } from './dto/saved-places.dto';
import { SavedPlacesService } from './saved-places.service';

@ApiBearerAuth()
@Controller()
export class SavedPlacesController {
  constructor(private readonly places: SavedPlacesService) {}

  @Get('customer/saved-places')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({ summary: 'List saved places (newest updated first)' })
  list(@CurrentUser() user: AuthUser) {
    return this.places.list(user.id);
  }

  @Post('customer/saved-places')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Create or upsert a saved place',
    description:
      'Same name (case-insensitive) or same HOME/WORK kind updates the existing place (200). ' +
      'Otherwise creates (201). Max 20 places per customer.',
  })
  @ApiGoErrors(E.VALIDATION_ERROR, E.SAVED_PLACES_LIMIT_REACHED)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSavedPlaceDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { created, place } = await this.places.upsert(user.id, dto);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return place;
  }

  @Patch('customer/saved-places/:placeId')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Partially update a saved place' })
  @ApiGoErrors(E.NOT_FOUND, E.VALIDATION_ERROR)
  update(
    @CurrentUser() user: AuthUser,
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Body() dto: UpdateSavedPlaceDto,
  ) {
    return this.places.update(user.id, placeId, dto);
  }

  @Delete('customer/saved-places/:placeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Delete a saved place' })
  @ApiGoErrors(E.NOT_FOUND)
  async remove(@CurrentUser() user: AuthUser, @Param('placeId', ParseUUIDPipe) placeId: string) {
    await this.places.remove(user.id, placeId);
  }
}
