const mongoose = require('mongoose');

const GitLabDataSchema = new mongoose.Schema({
  source: {
    type: String,
    required: true,
    unique: true,
    enum: ['handbook', 'direction']
  },
  content: {
    type: String,
    required: true,
  },
  scrapedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update scrapedAt on each save
GitLabDataSchema.pre('save', function(next) {
  this.scrapedAt = Date.now();
  next();
});

const GitLabData = mongoose.model('GitLabData', GitLabDataSchema);

module.exports = GitLabData; 