import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { GoRole } from '@/generated/prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { DriverPassportService } from './driver-passport.service';

class CreateDriverLevelDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) level_order!: number;
  @ApiProperty() @IsString() @MaxLength(120) name_ar!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name_en?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() icon?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() minimum_score?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() is_active?: boolean;
}

class UpdateDriverLevelDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name_ar?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name_en?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() icon_storage_key?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() icon?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() minimum_score?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() is_active?: boolean;
}

@ApiBearerAuth()
@Controller()
export class DriverPassportController {
  constructor(private readonly driverPassport: DriverPassportService) {}

  @Get('driver/passport')
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'Driver passport framework view (Ticket §27) — no score rules yet',
  })
  driverView(@CurrentUser() user: AuthUser) {
    return this.driverPassport.getDriverView(user.id);
  }

  @Get('admin/driver-passport/records')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Driver passport records (score placeholder and completed rides)' })
  records() {
    return this.driverPassport.listPassports();
  }

  @Get('admin/driver-passport/levels')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  listLevels() {
    return this.driverPassport.listLevels();
  }

  @Get('admin/driver-passport/levels/:levelId')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  getLevel(@Param('levelId', ParseUUIDPipe) levelId: string) {
    return this.driverPassport.getLevel(levelId);
  }

  @Post('admin/driver-passport/levels')
  @HttpCode(HttpStatus.CREATED)
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  createLevel(@CurrentUser() user: AuthUser, @Body() dto: CreateDriverLevelDto) {
    return this.driverPassport.createLevel(user, dto);
  }

  @Patch('admin/driver-passport/levels/:levelId')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  updateLevel(
    @CurrentUser() user: AuthUser,
    @Param('levelId', ParseUUIDPipe) levelId: string,
    @Body() dto: UpdateDriverLevelDto,
  ) {
    return this.driverPassport.updateLevel(user, levelId, dto);
  }

  @Get('admin/driver-passport/levels/:levelId/icon')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Driver passport level icon' })
  async adminLevelIcon(@Param('levelId', ParseUUIDPipe) levelId: string) {
    const file = await this.driverPassport.readLevelIcon(levelId);
    return new StreamableFile(file.data, { type: file.mime, disposition: 'inline' });
  }

  @Get('driver/passport/levels/:levelId/icon')
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({ summary: 'Passport level icon for the driver app' })
  async driverLevelIcon(@Param('levelId', ParseUUIDPipe) levelId: string) {
    const file = await this.driverPassport.readLevelIcon(levelId);
    return new StreamableFile(file.data, { type: file.mime, disposition: 'inline' });
  }
}
