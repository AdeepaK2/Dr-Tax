import { ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { APP_CONFIG, type AppConfig } from '../config.js';
import type { LoginDto, RegisterDto, UpdateProfileDto } from './auth.dto.js';
import { hashPassword, verifyPassword } from './password.js';
import { User } from './user.schema.js';

export type PublicUser = { id: string; email: string; name: string; profile: Record<string, unknown> };
export type Session = { token: string; expiresAt: string; user: PublicUser };

// Used when the email doesn't exist, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async register(dto: RegisterDto): Promise<Session> {
    const email = dto.email.trim().toLowerCase();
    if (await this.users.exists({ email })) {
      throw new ConflictException('An account with this email already exists. Sign in instead.');
    }
    const user = await this.users.create({
      email,
      name: dto.name.trim(),
      passwordHash: await hashPassword(dto.password),
      lastLoginAt: new Date(),
    });
    return this.session(user);
  }

  async login(dto: LoginDto): Promise<Session> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.users.findOne({ email });
    const ok = await verifyPassword(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException('Wrong email or password');
    user.lastLoginAt = new Date();
    await user.save();
    return this.session(user);
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('Account not found');
    return this.toPublic(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<PublicUser> {
    const set: Record<string, unknown> = {};
    if (dto.name !== undefined) set.name = dto.name.trim();
    if (dto.profile !== undefined) set.profile = dto.profile;
    const user = await this.users.findByIdAndUpdate(userId, { $set: set }, { new: true });
    if (!user) throw new NotFoundException('Account not found');
    return this.toPublic(user);
  }

  private async session(user: User & { _id: unknown }): Promise<Session> {
    const ttlSeconds = this.config.tokenTtlDays * 24 * 60 * 60;
    const token = await this.jwt.signAsync({ sub: String(user._id), email: user.email }, { expiresIn: ttlSeconds });
    return { token, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(), user: this.toPublic(user) };
  }

  private toPublic(user: User & { _id: unknown }): PublicUser {
    return { id: String(user._id), email: user.email, name: user.name, profile: user.profile ?? {} };
  }
}
