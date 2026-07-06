import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { CreateLeadDto, UpdateLeadDto, ConvertLeadDto } from './dto/leads.dto';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @RequirePermissions('lead:view')
  list(@CurrentUser() user: AuthUser, @Query() query: any) {
    return this.leads.list(user, query);
  }

  @Get('duplicates')
  @RequirePermissions('lead:view')
  duplicates(@Query('email') email?: string, @Query('phone') phone?: string) {
    return this.leads.findDuplicates(email, phone);
  }

  @Get(':id')
  @RequirePermissions('lead:view')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leads.get(user, id);
  }

  @Post()
  @RequirePermissions('lead:create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLeadDto) {
    return this.leads.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('lead:edit')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leads.update(user, id, dto);
  }

  @Post(':id/convert')
  @RequirePermissions('lead:edit', 'contact:create')
  convert(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ConvertLeadDto) {
    return this.leads.convert(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('lead:delete')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leads.remove(user, id);
  }
}
