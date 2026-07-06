import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { MessageChannel } from '@prisma/client';
import { MessagingService } from './messaging.service';
import { CallsService } from './calls.service';
import { TemplatesService } from './templates.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser } from '../../common/types/auth-user';
import {
  SendMessageDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  ClickToCallDto,
  LogCallDto,
} from './dto/messaging.dto';

@Controller()
export class MessagingController {
  constructor(
    private readonly messaging: MessagingService,
    private readonly calls: CallsService,
    private readonly templates: TemplatesService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Messages ──────────────────────────────────────────────────────────
  @Get('messages')
  @RequirePermissions('message:view')
  async list(@Query('contactId') contactId?: string, @Query('leadId') leadId?: string, @Query('threadId') threadId?: string) {
    const where: any = {
      ...(contactId ? { contactId } : {}),
      ...(leadId ? { leadId } : {}),
      ...(threadId ? { threadId } : {}),
    };
    const items = await this.prisma.client.message.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
    return { items };
  }

  @Post('messages')
  @RequirePermissions('message:create')
  send(@CurrentUser() user: AuthUser, @Body() dto: SendMessageDto) {
    return this.messaging.send(user, dto);
  }

  @Get('timeline/:recordType/:recordId')
  @RequirePermissions('message:view')
  timeline(
    @CurrentUser() user: AuthUser,
    @Param('recordType') recordType: 'lead' | 'contact' | 'deal',
    @Param('recordId') recordId: string,
  ) {
    return this.messaging.timeline(user, recordType, recordId);
  }

  // ── Templates ─────────────────────────────────────────────────────────
  @Get('templates')
  @RequirePermissions('message:view')
  listTemplates(@Query('channel') channel?: MessageChannel) {
    return this.templates.list(channel);
  }

  @Post('templates')
  @RequirePermissions('message:create')
  createTemplate(@CurrentUser() user: AuthUser, @Body() dto: CreateTemplateDto) {
    return this.templates.create(user, dto);
  }

  @Patch('templates/:id')
  @RequirePermissions('message:create')
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(id, dto);
  }

  @Delete('templates/:id')
  @RequirePermissions('message:create')
  removeTemplate(@Param('id') id: string) {
    return this.templates.remove(id);
  }

  // ── Calls ─────────────────────────────────────────────────────────────
  @Post('calls/click-to-call')
  @RequirePermissions('call:create')
  clickToCall(@CurrentUser() user: AuthUser, @Body() dto: ClickToCallDto) {
    return this.calls.clickToCall(user, dto);
  }

  @Post('calls/log')
  @RequirePermissions('call:create')
  logCall(@CurrentUser() user: AuthUser, @Body() dto: LogCallDto) {
    return this.calls.logCall(user, dto);
  }
}
