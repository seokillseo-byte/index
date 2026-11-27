import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

export class RegisterDto {
 @IsEmail() @MaxLength(254) email!: string;
 @IsString() @Length(12,128) password!: string;
 @IsString() @Length(2,80) displayName!: string;
 @IsString() @Length(2,80) @Matches(/^[\\p{L}\\p{N}][\\p{L}\\p{N} ._-]*$/u) workspaceName!: string;
}
export class LoginDto { @IsEmail() @MaxLength(254) email!: string; @IsString() @Length(12,128) password!: string; }
export class RefreshDto { @IsString() @Length(40,200) refreshToken!: string; }
export class VerifyEmailDto { @IsString() @Length(40,100) token!: string; }
export class ResendVerificationDto { @IsEmail() @MaxLength(254) email!: string; }
export class PasswordResetRequestDto { @IsEmail() @MaxLength(254) email!: string; }
export class PasswordResetDto { @IsString() @Length(40,200) token!: string; @IsString() @Length(12,128) password!: string; }
export class MfaVerifyDto { @IsString() @Length(6,6) @Matches(/^\\d{6}$/) code!: string; }
export class MfaLoginDto { @IsString() @Length(40,200) challengeToken!: string; @IsString() @Length(6,6) @Matches(/^\\d{6}$/) code!: string; }
export class MfaRecoveryDto { @IsString() @Length(8,32) challengeToken!: string; @IsString() @Length(8,32) recoveryCode!: string; }
export class MfaDisableDto { @IsString() @Length(12,128) password!: string; @IsString() @Length(6,6) @Matches(/^\\d{6}$/) code!: string; }
