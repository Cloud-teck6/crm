import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { IngestionService } from '../ingestion/ingestion.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CreateConnectionDto, UpdateConnectionDto } from './dto/integrations.dto';

@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly ingestion: IngestionService,
  ) {}

  @Get()
  @RequirePermissions('integration:view')
  list() {
    return this.integrations.list();
  }

  @Get(':id')
  @RequirePermissions('integration:view')
  get(@Param('id') id: string) {
    return this.integrations.get(id);
  }

  @Get(':id/events')
  @RequirePermissions('integration:view')
  events(@Param('id') id: string, @Query('page') page = '1', @Query('pageSize') pageSize = '50') {
    return this.integrations.events(id, Number(page) || 1, Number(pageSize) || 50);
  }

  @Post()
  @RequirePermissions('integration:manage')
  create(@Body() dto: CreateConnectionDto) {
    return this.integrations.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('integration:manage')
  update(@Param('id') id: string, @Body() dto: UpdateConnectionDto) {
    return this.integrations.update(id, dto);
  }

  @Post(':id/regenerate-key')
  @RequirePermissions('integration:manage')
  regenerate(@Param('id') id: string) {
    return this.integrations.regenerateKey(id);
  }

  @Post('events/:eventId/replay')
  @RequirePermissions('integration:manage')
  replay(@Param('eventId') eventId: string) {
    return this.ingestion.replayEvent(eventId);
  }

  @Delete(':id')
  @RequirePermissions('integration:manage')
  remove(@Param('id') id: string) {
    return this.integrations.remove(id);
  }
}
