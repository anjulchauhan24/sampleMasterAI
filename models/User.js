const express = require('express');
const User = require('../models/User');
const Resource = require('../models/Resource');
const Rating = require('../models/Rating');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/users/dashboard
// @desc    Get dashboard statistics for current user
// @access  Private
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user's uploaded resources count
    const uploadedCount = await Resource.countDocuments({
      author: userId,
      isActive: true
    });

    // Get user's total downloads received
    const uploadedResources = await Resource.find({
      author: userId,
      isActive: true
    }).select('downloadCount');

    const totalDownloads = uploadedResources.reduce((sum, resource) => sum + resource.downloadCount, 0);

    // Get user's ratings given
    const ratingsGiven = await Rating.countDocuments({
      user: userId,
      isActive: true
    });

    // Get user's average rating received
    const avgRatingResult = await Resource.aggregate([
      { $match: { author: userId, isActive: true, totalRatings: { $gt: 0 } } },
      { $group: { _id: null, avgRating: { $avg: '$averageRating' } } }
    ]);

    const averageRating = avgRatingResult.length > 0 ? Math.round(avgRatingResult[0].avgRating * 10) / 10 : 0;

    // Get recent activities
    const recentUploads = await Resource.find({
      author: userId,
      isActive: true
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title subject createdAt downloadCount averageRating');

    const recentRatings = await Rating.find({
      user: userId,
      isActive: true
    })
      .populate('resource', 'title subject author')
      .populate({
        path: 'resource',
        populate: {
          path: 'author',
          select: 'name'
        }
      })
      .sort({ createdAt: -1 })
      .limit(5);

    // Get subject distribution of user's uploads
    const subjectStats = await Resource.aggregate([
      { $match: { author: userId, isActive: true } },
      { $group: { _id: '$subject', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        stats: {
          uploadedResources: uploadedCount,
          totalDownloads,
          ratingsGiven,
          averageRating
        },
        recentActivity: {
          uploads: recentUploads,
          ratings: recentRatings
        },
        subjectDistribution: subjectStats
      }
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard data'
    });
  }
});

// @route   GET /api/users/my-resources
// @desc    Get current user's uploaded resources with detailed stats
// @access  Private
router.get('/my-resources', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, sortBy = 'createdAt', order = 'desc' } = req.query;

    let sort = {};
    switch (sortBy) {
      case 'downloads':
        sort.downloadCount = order === 'desc' ? -1 : 1;
        break;
      case 'rating':
        sort.averageRating = order === 'desc' ? -1 : 1;
        break;
      case 'title':
        sort.title = order === 'desc' ? -1 : 1;
        break;
      case 'views':
        sort.views = order === 'desc' ? -1 : 1;
        break;
      default:
        sort.createdAt = order === 'desc' ? -1 : 1;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const resources = await Resource.find({
      author: req.user.userId,
      isActive: true
    })
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('author', 'name university major');

    const total = await Resource.countDocuments({
      author: req.user.userId,
      isActive: true
    });

    // Get overall stats for user's resources
    const overallStats = await Resource.aggregate([
      { $match: { author: req.user.userId, isActive: true } },
      {
        $group: {
          _id: null,
          totalResources: { $sum: 1 },
          totalDownloads: { $sum: '$downloadCount' },
          totalViews: { $sum: '$views' },
          averageRating: { $avg: '$averageRating' },
          totalRatings: { $sum: '$totalRatings' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        resources,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / parseInt(limit)),
          hasNext: skip + parseInt(limit) < total,
          hasPrev: parseInt(page) > 1,
          totalResources: total
        },
        overallStats: overallStats[0] || {
          totalResources: 0,
          totalDownloads: 0,
          totalViews: 0,
          averageRating: 0,
          totalRatings: 0
        }
      }
    });

  } catch (error) {
    console.error('Get my resources error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching your resources'
    });
  }
});

// @route   GET /api/users/subjects
// @desc    Get all available subjects
// @access  Public
router.get('/subjects', async (req, res) => {
  try {
    const subjects = await Resource.distinct('subject', { isActive: true });
    
    // Get resource count per subject
    const subjectStats = await Resource.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$subject', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        subjects,
        stats: subjectStats
      }
    });

  } catch (error) {
    console.error('Get subjects error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching subjects'
    });
  }
});

// @route   GET /api/users/semesters
// @desc    Get all available semesters
// @access  Public
router.get('/semesters', async (req, res) => {
  try {
    const semesters = await Resource.distinct('semester', { isActive: true });
    
    // Get resource count per semester
    const semesterStats = await Resource.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$semester', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        semesters,
        stats: semesterStats
      }
    });

  } catch (error) {
    console.error('Get semesters error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching semesters'
    });
  }
});

// @route   GET /api/users/resource-types
// @desc    Get all available resource types
// @access  Public
router.get('/resource-types', async (req, res) => {
  try {
    const types = await Resource.distinct('type', { isActive: true });
    
    // Get resource count per type
    const typeStats = await Resource.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        types,
        stats: typeStats
      }
    });

  } catch (error) {
    console.error('Get resource types error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching resource types'
    });
  }
});

// @route   GET /api/users/profile/:userId
// @desc    Get public user profile
// @access  Public
router.get('/profile/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    
    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's public stats
    const resourceCount = await Resource.countDocuments({
      author: req.params.userId,
      isActive: true
    });

    const totalDownloads = await Resource.aggregate([
      { $match: { author: user._id, isActive: true } },
      { $group: { _id: null, total: { $sum: '$downloadCount' } } }
    ]);

    const avgRating = await Resource.aggregate([
      { $match: { author: user._id, isActive: true, totalRatings: { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: '$averageRating' } } }
    ]);

    const ratingsGiven = await Rating.countDocuments({
      user: req.params.userId,
      isActive: true
    });

    // Get user's recent resources (public)
    const recentResources = await Resource.find({
      author: req.params.userId,
      isActive: true
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title subject type createdAt averageRating downloadCount');

    // Get subject distribution
    const subjectStats = await Resource.aggregate([
      { $match: { author: user._id, isActive: true } },
      { $group: { _id: '$subject', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          university: user.university,
          major: user.major,
          year: user.year,
          joinedDate: user.createdAt
        },
        stats: {
          resourcesUploaded: resourceCount,
          totalDownloads: totalDownloads[0]?.total || 0,
          averageRating: Math.round((avgRating[0]?.avg || 0) * 10) / 10,
          ratingsGiven
        },
        recentResources,
        subjectDistribution: subjectStats
      }
    });

  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user profile'
    });
  }
});

// @route   GET /api/users/leaderboard
// @desc    Get user leaderboard
// @access  Public
router.get('/leaderboard', async (req, res) => {
  try {
    const { type = 'uploads', limit = 10 } = req.query;

    let pipeline = [];

    switch (type) {
      case 'downloads':
        pipeline = [
          {
            $lookup: {
              from: 'resources',
              localField: '_id',
              foreignField: 'author',
              as: 'resources'
            }
          },
          {
            $match: {
              isActive: true,
              'resources.isActive': true
            }
          },
          {
            $addFields: {
              totalDownloads: {
                $sum: {
                  $map: {
                    input: '$resources',
                    as: 'resource',
                    in: { $cond: [{ $eq: ['$resource.isActive', true] }, '$resource.downloadCount', 0] }
                  }
                }
              }
            }
          },
          { $sort: { totalDownloads: -1 } },
          { $limit: parseInt(limit) }
        ];
        break;

      case 'ratings':
        pipeline = [
          {
            $lookup: {
              from: 'resources',
              localField: '_id',
              foreignField: 'author',
              as: 'resources'
            }
          },
          {
            $match: {
              isActive: true,
              'resources.isActive': true
            }
          },
          {
            $addFields: {
              averageRating: {
                $avg: {
                  $map: {
                    input: { $filter: { input: '$resources', cond: { $and: [{ $eq: ['$this.isActive', true] }, { $gt: ['$this.totalRatings', 0] }] } } },
                    as: 'resource',
                    in: '$resource.averageRating'
                  }
                }
              },
              totalRatings: {
                $sum: {
                  $map: {
                    input: { $filter: { input: '$resources', cond: { $eq: ['$this.isActive', true] } } },
                    as: 'resource',
                    in: '$resource.totalRatings'
                  }
                }
              }
            }
          },
          { $match: { totalRatings: { $gte: 3 } } }, // Only users with at least 3 ratings
          { $sort: { averageRating: -1, totalRatings: -1 } },
          { $limit: parseInt(limit) }
        ];
        break;

      default: // uploads
        pipeline = [
          {
            $lookup: {
              from: 'resources',
              localField: '_id',
              foreignField: 'author',
              as: 'resources'
            }
          },
          {
            $match: {
              isActive: true
            }
          },
          {
            $addFields: {
              resourceCount: {
                $size: { $filter: { input: '$resources', cond: { $eq: ['$this.isActive', true] } } }
              }
            }
          },
          { $match: { resourceCount: { $gt: 0 } } },
          { $sort: { resourceCount: -1 } },
          { $limit: parseInt(limit) }
        ];
    }

    // Add projection to limit returned fields
    pipeline.push({
      $project: {
        name: 1,
        university: 1,
        major: 1,
        createdAt: 1,
        resourceCount: 1,
        totalDownloads: 1,
        averageRating: 1,
        totalRatings: 1
      }
    });

    const leaderboard = await User.aggregate(pipeline);

    res.json({
      success: true,
      data: {
        leaderboard,
        type,
        total: leaderboard.length
      }
    });

  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching leaderboard'
    });
  }
});

// @route   GET /api/users/:id
// @desc    Get user details (admin only or own profile)
// @access  Private
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    // Check if user is requesting their own profile or is admin
    if (req.params.id !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own detailed profile.'
      });
    }

    const user = await User.findById(req.params.id).select('-password');

    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get detailed stats
    const resourceStats = await Resource.aggregate([
      { $match: { author: user._id, isActive: true } },
      {
        $group: {
          _id: null,
          totalResources: { $sum: 1 },
          totalDownloads: { $sum: '$downloadCount' },
          totalViews: { $sum: '$views' },
          averageRating: { $avg: '$averageRating' },
          totalRatings: { $sum: '$totalRatings' }
        }
      }
    ]);

    const ratingStats = await Rating.aggregate([
      { $match: { user: user._id, isActive: true } },
      {
        $group: {
          _id: null,
          totalRatingsGiven: { $sum: 1 },
          averageRatingGiven: { $avg: '$rating' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        user,
        stats: {
          resources: resourceStats[0] || {
            totalResources: 0,
            totalDownloads: 0,
            totalViews: 0,
            averageRating: 0,
            totalRatings: 0
          },
          ratings: ratingStats[0] || {
            totalRatingsGiven: 0,
            averageRatingGiven: 0
          }
        }
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user details'
    });
  }
});

// @route   GET /api/users/test
// @desc    Test route
// @access  Public
router.get('/test', (req, res) => {
  res.json({ 
    success: true,
    message: 'User routes working!' 
  });
});

module.exports = router;