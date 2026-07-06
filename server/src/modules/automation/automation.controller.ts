import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { WorkflowService, TRIGGER_TYPES, ACTION_TYPES } from './workflow.service';
import { ScoringService } from './scoring.service';
import { AutomationService } from './automation.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser } from '../../common/types/auth-user';
import {
  CreateWorkflowDto,
  UpdateWorkflowDto,
  CreateScoringRuleDto,
  UpdateScoringRuleDto,
} from './dto/automation.dto';

@Controller()
export class AutomationController {
  constructor(
    private readonly workflows: WorkflowService,
    private readonly scoring: ScoringService,
    private readonly automation: AutomationService,
  ) {}

  // Metadata for the no-code builder UI.
  @Get('automation/meta')
  @RequirePermissions('workflow:view')
  meta() {
    return { triggerTypes: TRIGGER_TYPES, actionTypes: ACTION_TYPES };
  }

  // ── Workflows ─────────────────────────────────────────────────────────
  @Get('workflows')
  @RequirePermissions('workflow:view')
  listWorkflows() {
    return this.workflows.list();
  }

  @Get('workflows/:id')
  @RequirePermissions('workflow:view')
  getWorkflow(@Param('id') id: string) {
    return this.workflows.get(id);
  }

  @Post('workflows')
  @RequirePermissions('workflow:manage')
  createWorkflow(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkflowDto) {
    return this.workflows.create(user, dto);
  }

  @Patch('workflows/:id')
  @RequirePermissions('workflow:manage')
  updateWorkflow(@Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return this.workflows.update(id, dto);
  }

  @Delete('workflows/:id')
  @RequirePermissions('workflow:manage')
  removeWorkflow(@Param('id') id: string) {
    return this.workflows.remove(id);
  }

  @Post('workflows/:id/test')
  @RequirePermissions('workflow:view')
  testWorkflow(@Param('id') id: string, @Body() sample: Record<string, unknown>) {
    return this.automation.testWorkflow(id, sample);
  }

  // ── Scoring rules ─────────────────────────────────────────────────────
  @Get('scoring-rules')
  @RequirePermissions('workflow:view')
  listScoring() {
    return this.scoring.list();
  }

  @Post('scoring-rules')
  @RequirePermissions('workflow:manage')
  createScoring(@Body() dto: CreateScoringRuleDto) {
    return this.scoring.create(dto);
  }

  @Patch('scoring-rules/:id')
  @RequirePermissions('workflow:manage')
  updateScoring(@Param('id') id: string, @Body() dto: UpdateScoringRuleDto) {
    return this.scoring.update(id, dto);
  }

  @Delete('scoring-rules/:id')
  @RequirePermissions('workflow:manage')
  removeScoring(@Param('id') id: string) {
    return this.scoring.remove(id);
  }
}
