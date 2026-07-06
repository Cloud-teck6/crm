import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CustomFieldsService } from './custom-fields.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CreateCustomFieldDto, UpdateCustomFieldDto } from './dto/custom-fields.dto';

@Controller('custom-fields')
export class CustomFieldsController {
  constructor(private readonly fields: CustomFieldsService) {}

  @Get()
  @RequirePermissions('custom_field:view')
  list(@Query('objectType') objectType?: string) {
    return this.fields.list(objectType);
  }

  @Post()
  @RequirePermissions('custom_field:manage')
  create(@Body() dto: CreateCustomFieldDto) {
    return this.fields.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('custom_field:manage')
  update(@Param('id') id: string, @Body() dto: UpdateCustomFieldDto) {
    return this.fields.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('custom_field:manage')
  remove(@Param('id') id: string) {
    return this.fields.remove(id);
  }
}
