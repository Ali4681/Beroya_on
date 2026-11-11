import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ADMIN_ROLES } from '../../../common/auth/roles';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { Idempotent } from '../../../common/idempotency/idempotent.decorator';
import { CreateEmployeeDto, ListEmployeesQueryDto } from './dto/employees.dto';
import { EmployeesService } from './employees.service';

@ApiBearerAuth()
@ApiTags('Admin')
@Controller('admin/employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'List HR employees' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  list(@CurrentUser() user: AuthUser, @Query() q: ListEmployeesQueryDto) {
    return this.employees.list(user, q);
  }

  @Get(':id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Get HR employee' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND)
  get(@Param('id') id: string) {
    return this.employees.get(id);
  }

  @Idempotent()
  @Post()
  @Roles(...ADMIN_ROLES)
  @ApiOperation({
    summary: 'Create HR employee',
    description:
      'Required: base_salary, email, login_password, login_role (desk access). Personal/contract/docs otherwise optional.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.CONFLICT, E.IDEMPOTENCY_KEY_REQUIRED)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEmployeeDto) {
    return this.employees.create(user, dto);
  }
}
