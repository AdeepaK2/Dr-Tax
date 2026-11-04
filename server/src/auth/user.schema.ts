import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, type HydratedDocument } from 'mongoose';

/** A Dr. Tax account. Each person's payments and backups belong to their account only. */
@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true }) email: string;
  @Prop({ type: String, required: true, trim: true }) name: string;
  @Prop({ type: String, required: true }) passwordHash: string;
  /** Profile from the app: other names, bank accounts. Kept so a new phone can be set up. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} }) profile: Record<string, unknown>;
  @Prop({ type: Date, default: null }) lastLoginAt: Date | null;
}
export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
