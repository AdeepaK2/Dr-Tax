import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// Field names match the phone's SQLite tables (in camelCase). Times are epoch milliseconds.

export class TxnDto {
  @IsInt() @Min(1) localId: number;
  @IsOptional() @IsInt() smsLocalId?: number | null;
  @IsString() @MaxLength(20) bank: string;
  @IsOptional() @IsString() @MaxLength(60) account?: string | null;
  @IsIn(['debit', 'credit']) direction: 'debit' | 'credit';
  @IsInt() @Min(0) amountCents: number;
  @IsString() @MaxLength(3) currency: string;
  @IsString() @MaxLength(200) merchant: string;
  @IsString() @MaxLength(1000) description: string;
  @IsString() @MaxLength(30) channel: string;
  @IsNumber() occurredAt: number;
  @IsIn(['pending', 'confirmed', 'cancelled', 'hold', 'excluded']) status: string;
  @IsString() @MaxLength(50) category: string;
  @IsBoolean() categoryLocked: boolean;
  @IsOptional() @IsString() @MaxLength(30) flag?: string | null;
  @IsOptional() @IsInt() linkedLocalId?: number | null;
  @IsBoolean() reviewed: boolean;
  @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
  @IsNumber() createdAt: number;
}

export class SmsDto {
  @IsInt() @Min(1) localId: number;
  @IsString() @MaxLength(40) androidId: string;
  @IsString() @MaxLength(60) sender: string;
  @IsString() @MaxLength(20) bank: string;
  @IsString() @MaxLength(2000) body: string;
  @IsNumber() receivedAt: number;
  @IsIn(['txn', 'cancel', 'otp', 'alert', 'unknown']) kind: string;
  @IsOptional() @IsInt() txnLocalId?: number | null;
}

export class RuleDto {
  @IsInt() localId: number;
  @IsString() @MaxLength(100) pattern: string;
  @IsString() @MaxLength(50) category: string;
  @IsNumber() createdAt: number;
}

export class CreateBackupDto {
  /** Random id the app generates once per install. */
  @IsString() @Matches(/^[A-Za-z0-9-]{8,64}$/) deviceId: string;
  @IsOptional() @IsString() @MaxLength(80) deviceName?: string;
  @IsOptional() @IsString() @MaxLength(20) appVersion?: string;
  /** 'nightly' when sent by the background job, 'manual' when you tap "Back up now". */
  @IsOptional() @IsIn(['nightly', 'manual']) trigger?: string;
  /** Allow replacing a non-empty backup with an empty one (normally refused). */
  @IsOptional() @IsBoolean() allowEmpty?: boolean;

  // Large backups are sent in several parts (hosts like Vercel cap a request at 4.5 MB).
  // All parts share a sessionId; the last one has final: true. A request without a
  // sessionId is a complete backup on its own.
  @IsOptional() @Matches(/^[A-Za-z0-9-]{8,64}$/) sessionId?: string;
  @IsOptional() @IsInt() @Min(0) part?: number;
  @IsOptional() @IsBoolean() final?: boolean;

  @ValidateNested({ each: true }) @Type(() => TxnDto) @ArrayMaxSize(200_000) txns: TxnDto[];
  @ValidateNested({ each: true }) @Type(() => SmsDto) @ArrayMaxSize(200_000) sms: SmsDto[];
  @ValidateNested({ each: true }) @Type(() => RuleDto) @ArrayMaxSize(5_000) rules: RuleDto[];
  @IsObject() settings: Record<string, unknown>;
}
