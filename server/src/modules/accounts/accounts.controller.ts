import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { CreateAccountDto, UpdateAccountDto } from './dto/accounts.dto';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @RequirePermissions('account:view')
  list(@CurrentUser() user: AuthUser, @Query() query: any) {
    return this.accounts.list(user, query);
  }

  @Get(':id')
  @RequirePermissions('account:view')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accounts.get(user, id);
  }

  @Post()
  @RequirePermissions('account:create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAccountDto) {
    return this.accounts.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('account:edit')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accounts.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('account:delete')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accounts.remove(user, id);
  }
}
