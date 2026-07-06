import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { PipelinesService } from './pipelines.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CreatePipelineDto, UpdatePipelineDto, StageInputDto, UpdateStageDto } from './dto/pipelines.dto';

@Controller('pipelines')
export class PipelinesController {
  constructor(private readonly pipelines: PipelinesService) {}

  @Get()
  @RequirePermissions('pipeline:view')
  list() {
    return this.pipelines.list();
  }

  @Get(':id')
  @RequirePermissions('pipeline:view')
  get(@Param('id') id: string) {
    return this.pipelines.get(id);
  }

  @Post()
  @RequirePermissions('pipeline:manage')
  create(@Body() dto: CreatePipelineDto) {
    return this.pipelines.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('pipeline:manage')
  update(@Param('id') id: string, @Body() dto: UpdatePipelineDto) {
    return this.pipelines.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('pipeline:manage')
  remove(@Param('id') id: string) {
    return this.pipelines.remove(id);
  }

  @Post(':id/stages')
  @RequirePermissions('pipeline:manage')
  addStage(@Param('id') id: string, @Body() dto: StageInputDto) {
    return this.pipelines.addStage(id, dto);
  }

  @Patch('stages/:stageId')
  @RequirePermissions('pipeline:manage')
  updateStage(@Param('stageId') stageId: string, @Body() dto: UpdateStageDto) {
    return this.pipelines.updateStage(stageId, dto);
  }

  @Delete('stages/:stageId')
  @RequirePermissions('pipeline:manage')
  removeStage(@Param('stageId') stageId: string) {
    return this.pipelines.removeStage(stageId);
  }
}
