import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StageInputDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number;
  @IsOptional() @IsBoolean() isWon?: boolean;
  @IsOptional() @IsBoolean() isLost?: boolean;
  @IsOptional() @IsInt() @Min(1) rotDays?: number;
}

export class CreatePipelineDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StageInputDto)
  stages?: StageInputDto[];
}

export class UpdatePipelineDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateStageDto {
  @IsOptional() @IsString() @MaxLength(60) name?: string;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number;
  @IsOptional() @IsBoolean() isWon?: boolean;
  @IsOptional() @IsBoolean() isLost?: boolean;
  @IsOptional() @IsInt() @Min(1) rotDays?: number;
}
