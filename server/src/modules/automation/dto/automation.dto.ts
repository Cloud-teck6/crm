import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WorkflowActionDto {
  @IsString() type!: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
  @IsOptional() @IsString() event?: string;
}

export class CreateScoringRuleDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsObject() condition!: Record<string, unknown>; // { match, rules: [...] }
  @IsInt() points!: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateScoringRuleDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsObject() condition?: Record<string, unknown>;
  @IsOptional() @IsInt() points?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateWorkflowDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsObject() trigger!: Record<string, unknown>; // { type: 'lead.created' | 'deal.stage_changed' | 'message.inbound', config? }
  @IsOptional() @IsObject() conditions?: Record<string, unknown>; // ConditionGroup
  @IsArray() @ValidateNested({ each: true }) @Type(() => WorkflowActionDto) actions!: WorkflowActionDto[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateWorkflowDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsObject() trigger?: Record<string, unknown>;
  @IsOptional() @IsObject() conditions?: Record<string, unknown>;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => WorkflowActionDto) actions?: WorkflowActionDto[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}
