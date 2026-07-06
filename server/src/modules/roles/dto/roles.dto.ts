import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DataScope } from '@prisma/client';

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsEnum(DataScope)
  dataScope!: DataScope;

  @IsArray()
  @IsString({ each: true })
  permissions!: string[];

  // { "<resource>": ["fieldA", "fieldB"] } — fields hidden for this role.
  @IsOptional()
  @IsObject()
  fieldRestrictions?: Record<string, string[]>;
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @IsEnum(DataScope)
  dataScope?: DataScope;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsObject()
  fieldRestrictions?: Record<string, string[]>;
}
