const mongoose = require('mongoose');

const GitLabDataSchema = new mongoose.Schema({
  source: {
    type: String,
    required: true,
    unique: true,
    enum: ['handbook', 'direction', 'last_conversation', 'refresh_status']
  },
  content: {
    type: String, // Storing as a JSON string
    required: true,
  },
  scrapedAt: {
    type: Date,
    default: Date.now,
  },
  isRefreshing: {
    type: Boolean,
    default: false
  },
  lastRefreshAttempt: {
    type: Date,
    default: null
  },
  lastRefreshError: {
    type: String,
    default: null
  }
});

GitLabDataSchema.pre('save', function(next) {
  this.scrapedAt = new Date();
  next();
});

const GitLabData = mongoose.model('GitLabData', GitLabDataSchema);

module.exports = GitLabData; 