import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { CreateContactDto, UpdateContactDto } from './dto/contacts.dto';

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  @RequirePermissions('contact:view')
  list(@CurrentUser() user: AuthUser, @Query() query: any) {
    return this.contacts.list(user, query);
  }

  @Get(':id')
  @RequirePermissions('contact:view')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.contacts.get(user, id);
  }

  @Post()
  @RequirePermissions('contact:create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateContactDto) {
    return this.contacts.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('contact:edit')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.contacts.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('contact:delete')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.contacts.remove(user, id);
  }
}
