import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsString()
  roleId!: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  territoryId?: string;

  // Phase 1: admin sets an initial password. Email-invite flow lands in Phase 7.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/[A-Za-z]/, { message: 'Password must contain a letter' })
  @Matches(/[0-9]/, { message: 'Password must contain a number' })
  password!: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsString()
  teamId?: string | null;

  @IsOptional()
  @IsString()
  territoryId?: string | null;
}
