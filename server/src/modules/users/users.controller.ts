import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('user:view')
  list(@Query('page') page = '1', @Query('pageSize') pageSize = '50') {
    return this.users.list(Number(page) || 1, Number(pageSize) || 50);
  }

  @Get(':id')
  @RequirePermissions('user:view')
  get(@Param('id') id: string) {
    return this.users.get(id);
  }

  @Post()
  @RequirePermissions('user:create')
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(actor, dto);
  }

  @Patch(':id')
  @RequirePermissions('user:edit')
  update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(actor, id, dto);
  }

  @Post(':id/deactivate')
  @RequirePermissions('user:delete')
  deactivate(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.users.setStatus(actor, id, 'DEACTIVATED');
  }

  @Post(':id/reactivate')
  @RequirePermissions('user:edit')
  reactivate(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.users.setStatus(actor, id, 'ACTIVE');
  }
}
