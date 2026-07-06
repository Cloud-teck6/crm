import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CreateRoleDto, UpdateRoleDto } from './dto/roles.dto';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  // The full permission grid for the role editor. Any authenticated user may
  // read it (needed to render their own capabilities); no record data exposed.
  @Get('permission-catalog')
  catalog() {
    return this.roles.catalog();
  }

  @Get()
  @RequirePermissions('role:view')
  list() {
    return this.roles.list();
  }

  @Get(':id')
  @RequirePermissions('role:view')
  get(@Param('id') id: string) {
    return this.roles.get(id);
  }

  @Post()
  @RequirePermissions('role:create')
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('role:edit')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('role:delete')
  remove(@Param('id') id: string) {
    return this.roles.remove(id);
  }
}
