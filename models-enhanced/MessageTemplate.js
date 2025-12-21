import mongoose from 'mongoose';

const messageTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  text: {
    type: String,
    required: true
  },
  variables: [{
    type: String
  }],
  category: {
    type: String,
    enum: ['welcome', 'ride_notification', 'payment_reminder', 'registration', 'general', 'alert'],
    default: 'general'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  usageCount: {
    type: Number,
    default: 0
  },
  lastUsed: Date,
  createdBy: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date
});

messageTemplateSchema.index({ name: 1 });
messageTemplateSchema.index({ category: 1 });

const MessageTemplate = mongoose.model('MessageTemplate', messageTemplateSchema);
export default MessageTemplate;
