import { Schema, model, Document } from 'mongoose';

export interface IAgentActionNonce extends Document {
  nonce: string;
  userId: string;
  action: string;
  used: boolean;
  expiresAt: Date;
  createdAt: Date;
}

const agentActionNonceSchema = new Schema<IAgentActionNonce>(
  {
    nonce: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    action: { type: String, required: true },
    used: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
  }
);

// Auto-expire documents after 10 minutes
agentActionNonceSchema.index({ createdAt: 1 }, { expireAfterSeconds: 600 });

export const AgentActionNonceModel = model<IAgentActionNonce>(
  'AgentActionNonce',
  agentActionNonceSchema
);
