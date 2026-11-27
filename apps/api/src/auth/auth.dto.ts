import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';
export class RegisterDto {
 @IsEmail() @MaxLength(254) email!: string;
 @IsString() @Length(12,128) password!: string;
 @IsString() @Length(2,80) displayName!: string;
 @IsString() @Length(2,80) @Matches(/^[a-zA-Z0-9][a-zA-Z0-9 -]*$/) workspaceName!: string;
}
export class LoginDto { @IsEmail() @MaxLength(254) email!: string; @IsString() @Length(12,128) password!: string; }
export class RefreshDto { @IsString() @Length(40,200) refreshToken!: string; }
