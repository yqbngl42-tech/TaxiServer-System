import mongoose from 'mongoose';

const messageLogSchema = new mongoose.Schema({
  to: {
    type: String,
    required: true
  },
  text: {
    type: String,
    required: true
  },
  templateId: String,
  templateName: String,
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'failed', 'read'],
    default: 'pending'
  },
  messageId: String,
  sentAt: Date,
  deliveredAt: Date,
  readAt: Date,
  failureReason: String,
  retryCount: {
    type: Number,
    default: 0
  },
  campaignId: String,
  metadata: mongoose.Schema.Types.Mixed,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

messageLogSchema.index({ to: 1, createdAt: -1 });
messageLogSchema.index({ status: 1 });
messageLogSchema.index({ campaignId: 1 });
messageLogSchema.index({ createdAt: -1 });

const MessageLog = mongoose.model('MessageLog', messageLogSchema);
export default MessageLog;
