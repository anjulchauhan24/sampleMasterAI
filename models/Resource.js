// models/Resource.js
const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  subject: { type: String, required: true },
  semester: { type: String, required: true },
  type: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filename: { type: String, required: true },
  filePath: { type: String, required: true },
  downloadCount: { type: Number, default: 0 },
  averageRating: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  tags: [String],
  ratings: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, min: 1, max: 5 },
    feedback: String,
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Resource', resourceSchema);