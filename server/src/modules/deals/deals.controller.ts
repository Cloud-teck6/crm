import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { DealsService } from './deals.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { CreateDealDto, UpdateDealDto, MoveDealDto } from './dto/deals.dto';

@Controller('deals')
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @Get()
  @RequirePermissions('deal:view')
  list(@CurrentUser() user: AuthUser, @Query() query: any) {
    return this.deals.list(user, query);
  }

  @Get('board')
  @RequirePermissions('deal:view')
  board(@CurrentUser() user: AuthUser, @Query('pipelineId') pipelineId?: string) {
    return this.deals.board(user, pipelineId);
  }

  @Get(':id')
  @RequirePermissions('deal:view')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deals.get(user, id);
  }

  @Post()
  @RequirePermissions('deal:create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDealDto) {
    return this.deals.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('deal:edit')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDealDto) {
    return this.deals.update(user, id, dto);
  }

  @Post(':id/move')
  @RequirePermissions('deal:edit')
  move(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MoveDealDto) {
    return this.deals.move(user, id, dto.stageId);
  }

  @Delete(':id')
  @RequirePermissions('deal:delete')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deals.remove(user, id);
  }
}
