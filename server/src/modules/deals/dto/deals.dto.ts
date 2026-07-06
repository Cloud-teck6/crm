import {
  IsArray,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateDealDto {
  @IsString() @MinLength(1) @MaxLength(160) title!: string;
  @IsString() pipelineId!: string;
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsNumber() @Min(0) value?: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number;
  @IsOptional() @IsISO8601() expectedCloseDate?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}

export class UpdateDealDto {
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsNumber() @Min(0) value?: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number;
  @IsOptional() @IsISO8601() expectedCloseDate?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}

export class MoveDealDto {
  @IsString() stageId!: string;
}
