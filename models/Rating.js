const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  resource: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Resource',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  feedback: {
    type: String,
    trim: true,
    maxlength: 500
  },
  isHelpful: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  helpfulCount: {
    type: Number,
    default: 0
  },
  isReported: {
    type: Boolean,
    default: false
  },
  reports: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound index to ensure one rating per user per resource
ratingSchema.index({ user: 1, resource: 1 }, { unique: true });

// Method to mark rating as helpful
ratingSchema.methods.markHelpful = function(userId) {
  const existingHelpful = this.isHelpful.find(h => h.user.toString() === userId.toString());
  
  if (existingHelpful) {
    // Remove if already marked helpful
    this.isHelpful = this.isHelpful.filter(h => h.user.toString() !== userId.toString());
    this.helpfulCount = Math.max(0, this.helpfulCount - 1);
  } else {
    // Add helpful mark
    this.isHelpful.push({ user: userId });
    this.helpfulCount += 1;
  }
  
  return this.save();
};

// Method to report rating
ratingSchema.methods.reportRating = function(userId, reason) {
  const existingReport = this.reports.find(r => r.user.toString() === userId.toString());
  
  if (!existingReport) {
    this.reports.push({
      user: userId,
      reason: reason || 'Inappropriate content'
    });
    
    // Auto-hide if too many reports
    if (this.reports.length >= 3) {
      this.isActive = false;
    }
  }
  
  return this.save();
};

module.exports = mongoose.model('Rating', ratingSchema);