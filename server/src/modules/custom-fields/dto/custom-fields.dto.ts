import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CustomFieldType } from '@prisma/client';

export const CUSTOM_FIELD_OBJECTS = ['Lead', 'Contact', 'Account', 'Deal'] as const;
export type CustomFieldObject = (typeof CUSTOM_FIELD_OBJECTS)[number];

export class CreateCustomFieldDto {
  @IsIn(CUSTOM_FIELD_OBJECTS as unknown as string[])
  objectType!: CustomFieldObject;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  // snake_case key used inside the record's customFields jsonb.
  @IsString()
  @Matches(/^[a-z][a-z0-9_]*$/, { message: 'apiName must be snake_case' })
  @MaxLength(60)
  apiName!: string;

  @IsEnum(CustomFieldType)
  type!: CustomFieldType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[]; // for DROPDOWN / MULTISELECT

  @IsOptional()
  @IsInt()
  order?: number;
}

export class UpdateCustomFieldDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsInt()
  order?: number;
}
