const express = require('express');
const Resource = require('../models/Resource');
const Rating = require('../models/Rating');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Add or update rating for a resource
router.post('/', auth, async (req, res) => {
  try {
    const { resourceId, rating, feedback } = req.body;

    if (!resourceId || !rating) {
      return res.status(400).json({ message: 'Resource ID and rating are required' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    const resource = await Resource.findById(resourceId);
    if (!resource || !resource.isActive) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    if (resource.author.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot rate your own resource' });
    }

    const existingRating = await Rating.findOne({
      user: req.user._id,
      resource: resourceId
    });

    let ratingDoc;
    if (existingRating) {
      existingRating.rating = rating;
      existingRating.feedback = feedback || '';
      ratingDoc = await existingRating.save();
    } else {
      ratingDoc = new Rating({
        user: req.user._id,
        resource: resourceId,
        rating,
        feedback: feedback || ''
      });
      await ratingDoc.save();

      // Award reputation to user for rating
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { reputation: 2 }
      });
    }

    // Update resource ratings array
    if (existingRating) {
      await Resource.findOneAndUpdate(
        { _id: resourceId, 'ratings.user': req.user._id },
        {
          $set: {
            'ratings.$.rating': rating,
            'ratings.$.feedback': feedback || '',
            'ratings.$.createdAt': new Date()
          }
        }
      );
    } else {
      await Resource.findByIdAndUpdate(resourceId, {
        $push: {
          ratings: {
            user: req.user._id,
            rating,
            feedback: feedback || '',
            createdAt: new Date()
          }
        }
      });
    }

    // Recalculate average rating
    const updatedResource = await Resource.findById(resourceId);
    await updatedResource.calculateAverageRating();

    // Award reputation to resource author
    await User.findByIdAndUpdate(resource.author, {
      $inc: { reputation: rating > 3 ? 3 : 1 }
    });

    res.status(existingRating ? 200 : 201).json({
      message: existingRating ? 'Rating updated successfully' : 'Rating added successfully',
      rating: ratingDoc
    });

  } catch (error) {
    console.error('Rating error:', error);
    res.status(500).json({ message: 'Server error while processing rating' });
  }
});

// Get all ratings for a resource
router.get('/resource/:resourceId', async (req, res) => {
  try {
    const ratings = await Rating.find({ resource: req.params.resourceId })
      .populate('user', 'name department')
      .sort({ createdAt: -1 });

    res.json({ ratings });

  } catch (error) {
    console.error('Get ratings error:', error);
    res.status(500).json({ message: 'Server error while fetching ratings' });
  }
});

// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'Rating routes working!' });
});

module.exports = router;