const express = require('express');
const User = require('../models/User');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// Get user profile
router.get('/:id', auth, async (req, res) => {
  try {
    if (req.params.id !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('uploadedResources', 'title subject type averageRating downloadCount')
      .populate('downloadedResources', 'title subject type');

    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error while fetching user' });
  }
});

// Get user leaderboard by reputation
router.get('/leaderboard/reputation', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const users = await User.find({ isActive: true })
      .select('name department reputation uploadedResources')
      .populate('uploadedResources', 'title')
      .sort({ reputation: -1 })
      .limit(limit)
      .lean();

    res.json({ leaderboard: users });

  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ message: 'Server error while fetching leaderboard' });
  }
});

// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'User routes working!' });
});

module.exports = router;
