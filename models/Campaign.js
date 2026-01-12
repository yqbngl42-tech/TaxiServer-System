import mongoose from 'mongoose';

const campaignSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  targetAudience: {
    filters: mongoose.Schema.Types.Mixed,
    estimatedCount: Number,
    actualCount: Number
  },
  message: {
    templateId: String,
    text: String,
    variables: mongoose.Schema.Types.Mixed
  },
  scheduledFor: Date,
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'in_progress', 'completed', 'cancelled', 'failed'],
    default: 'draft'
  },
  stats: {
    total: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    read: { type: Number, default: 0 }
  },
  createdBy: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date,
  startedAt: Date,
  completedAt: Date,
  cancelledAt: Date,
  cancelledBy: String,
  cancellationReason: String
});

campaignSchema.index({ status: 1 });
campaignSchema.index({ scheduledFor: 1 });
campaignSchema.index({ createdAt: -1 });

const Campaign = mongoose.model('Campaign', campaignSchema);
export default Campaign;
