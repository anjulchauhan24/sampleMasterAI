const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const Resource = require('../models/Resource');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/resources');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Create unique filename: timestamp-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, uniqueSuffix + '-' + safeFilename);
  }
});

const fileFilter = (req, file, cb) => {
  // Accept only specific file types
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/gif'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, DOC, DOCX, PPT, PPTX, TXT, JPG, PNG, GIF files are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB limit
  },
  fileFilter: fileFilter
});

// Validation rules
const uploadValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ min: 2, max: 200 })
    .withMessage('Title must be between 2 and 200 characters'),
  body('description')
    .trim()
    .notEmpty()
    .withMessage('Description is required')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('subject')
    .notEmpty()
    .withMessage('Subject is required')
    .isIn(['Mathematics', 'Physics', 'Computer Science', 'Chemistry', 'Biology', 'Engineering', 'Business', 'Arts', 'Other'])
    .withMessage('Invalid subject'),
  body('semester')
    .notEmpty()
    .withMessage('Semester is required'),
  body('type')
    .notEmpty()
    .withMessage('Type is required')
    .isIn(['Notes', 'Exam Paper', 'Study Guide', 'Assignment', 'Presentation', 'Other'])
    .withMessage('Invalid type')
];

// @route   GET /api/resources
// @desc    Get all resources with filtering and search
// @access  Public
router.get('/', async (req, res) => {
  try {
    const {
      search,
      subject,
      semester,
      type,
      author,
      sortBy = 'createdAt',
      order = 'desc',
      page = 1,
      limit = 12
    } = req.query;

    let query = { isActive: true };
    let sort = {};

    // Build search query
    if (search && search.trim()) {
      query.$or = [
        { title: { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } },
        { tags: { $in: [new RegExp(search.trim(), 'i')] } }
      ];
    }

    // Apply filters
    if (subject && subject !== 'all') {
      query.subject = subject;
    }
    if (semester && semester !== 'all') {
      query.semester = semester;
    }
    if (type && type !== 'all') {
      query.type = type;
    }
    if (author) {
      query.author = author;
    }

    // Build sort object
    switch (sortBy) {
      case 'rating':
        sort.averageRating = order === 'desc' ? -1 : 1;
        sort.totalRatings = -1; // Secondary sort
        break;
      case 'downloads':
        sort.downloadCount = order === 'desc' ? -1 : 1;
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

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const resources = await Resource.find(query)
      .populate('author', 'name university major')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Resource.countDocuments(query);

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
        }
      }
    });

  } catch (error) {
    console.error('Get resources error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching resources'
    });
  }
});

// @route   GET /api/resources/stats
// @desc    Get resource statistics
// @access  Public
router.get('/stats', async (req, res) => {
  try {
    const totalResources = await Resource.countDocuments({ isActive: true });
    const totalDownloads = await Resource.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, total: { $sum: '$downloadCount' } } }
    ]);
    
    const avgRating = await Resource.aggregate([
      { $match: { isActive: true, totalRatings: { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: '$averageRating' } } }
    ]);

    const subjectStats = await Resource.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$subject', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        totalResources,
        totalDownloads: totalDownloads[0]?.total || 0,
        averageRating: Math.round((avgRating[0]?.avg || 0) * 10) / 10,
        subjectDistribution: subjectStats
      }
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching statistics'
    });
  }
});

// @route   GET /api/resources/top-rated
// @desc    Get top-rated resources
// @access  Public
router.get('/top-rated', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const resources = await Resource.getTopRated(limit);

    res.json({
      success: true,
      data: {
        resources
      }
    });

  } catch (error) {
    console.error('Get top-rated resources error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching top-rated resources'
    });
  }
});

// @route   GET /api/resources/most-downloaded
// @desc    Get most downloaded resources
// @access  Public
router.get('/most-downloaded', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const resources = await Resource.getPopular(limit);

    res.json({
      success: true,
      data: {
        resources
      }
    });

  } catch (error) {
    console.error('Get most downloaded resources error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching most downloaded resources'
    });
  }
});

// @route   GET /api/resources/recent
// @desc    Get recent resources
// @access  Public
router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const resources = await Resource.getRecent(limit);

    res.json({
      success: true,
      data: {
        resources
      }
    });

  } catch (error) {
    console.error('Get recent resources error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching recent resources'
    });
  }
});

// @route   GET /api/resources/:id
// @desc    Get single resource by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id)
      .populate('author', 'name university major email')
      .populate('ratings.user', 'name university');

    if (!resource || !resource.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }

    // Increment view count
    await resource.incrementViewCount();

    res.json({
      success: true,
      data: {
        resource
      }
    });

  } catch (error) {
    console.error('Get resource error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching resource'
    });
  }
});

// @route   POST /api/resources
// @desc    Upload new resource
// @access  Private
router.post('/', authenticateToken, upload.single('file'), uploadValidation, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Delete uploaded file if validation fails
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { title, description, subject, semester, type, tags } = req.body;

    // Process tags
    let tagArray = [];
    if (tags && tags.trim()) {
      tagArray = tags.split(',')
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0)
        .slice(0, 10); // Limit to 10 tags
    }

    // Create new resource
    const resource = new Resource({
      title: title.trim(),
      description: description.trim(),
      subject,
      semester,
      type,
      author: req.user.userId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      tags: tagArray
    });

    await resource.save();

    // Populate author info for response
    await resource.populate('author', 'name university major');

    res.status(201).json({
      success: true,
      message: 'Resource uploaded successfully',
      data: {
        resource
      }
    });

  } catch (error) {
    // Delete uploaded file if there was an error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    console.error('Upload resource error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while uploading resource'
    });
  }
});

// @route   PUT /api/resources/:id
// @desc    Update resource (only by author)
// @access  Private
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { title, description, subject, semester, type, tags } = req.body;

    const resource = await Resource.findById(req.params.id);
    if (!resource || !resource.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }

    // Check if user is the author
    if (resource.author.toString() !== req.user.userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own resources'
      });
    }

    // Update fields if provided
    if (title && title.trim()) resource.title = title.trim();
    if (description && description.trim()) resource.description = description.trim();
    if (subject) resource.subject = subject;
    if (semester) resource.semester = semester;
    if (type) resource.type = type;
    
    if (tags !== undefined) {
      if (tags.trim()) {
        resource.tags = tags.split(',')
          .map(tag => tag.trim().toLowerCase())
          .filter(tag => tag.length > 0)
          .slice(0, 10);
      } else {
        resource.tags = [];
      }
    }

    await resource.save();
    await resource.populate('author', 'name university major');

    res.json({
      success: true,
      message: 'Resource updated successfully',
      data: {
        resource
      }
    });

  } catch (error) {
    console.error('Update resource error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating resource'
    });
  }
});

// @route   DELETE /api/resources/:id
// @desc    Delete resource (only by author)
// @access  Private
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource || !resource.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }

    // Check if user is the author
    if (resource.author.toString() !== req.user.userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own resources'
      });
    }

    // Soft delete - mark as inactive
    resource.isActive = false;
    await resource.save();

    res.json({
      success: true,
      message: 'Resource deleted successfully'
    });

  } catch (error) {
    console.error('Delete resource error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting resource'
    });
  }
});

// @route   GET /api/resources/:id/download
// @desc    Download resource
// @access  Private
router.get('/:id/download', authenticateToken, async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource || !resource.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }

    // Check if file exists
    if (!fs.existsSync(resource.filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found on server'
      });
    }

    // Increment download count
    await resource.incrementDownloadCount();

    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${resource.originalName}"`);
    res.setHeader('Content-Type', resource.mimeType);
    res.setHeader('Content-Length', resource.fileSize);

    // Stream file to client
    const fileStream = fs.createReadStream(resource.filePath);
    fileStream.on('error', (error) => {
      console.error('File stream error:', error);
      res.status(500).json({
        success: false,
        message: 'Error streaming file'
      });
    });
    
    fileStream.pipe(res);

  } catch (error) {
    console.error('Download resource error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while downloading resource'
    });
  }
});

// @route   POST /api/resources/:id/rate
// @desc    Rate a resource
// @access  Private
router.post('/:id/rate', authenticateToken, async (req, res) => {
  try {
    const { rating, feedback } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    const resource = await Resource.findById(req.params.id);
    if (!resource || !resource.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Resource not found'
      });
    }

    // Check if user is trying to rate their own resource
    if (resource.author.toString() === req.user.userId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot rate your own resource'
      });
    }

    // Add or update rating
    await resource.addRating(req.user.userId, rating, feedback);
    await resource.save();

    res.json({
      success: true,
      message: 'Rating added successfully',
      data: {
        averageRating: resource.averageRating,
        totalRatings: resource.totalRatings
      }
    });

  } catch (error) {
    console.error('Rate resource error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while rating resource'
    });
  }
});

// @route   GET /api/resources/my/uploads
// @desc    Get current user's uploaded resources
// @access  Private
router.get('/my/uploads', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, sortBy = 'createdAt', order = 'desc' } = req.query;

    let sort = {};
    sort[sortBy] = order === 'desc' ? -1 : 1;

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
        }
      }
    });

  } catch (error) {
    console.error('Get user uploads error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching your uploads'
    });
  }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 15MB.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field.'
      });
    }
  }
  
  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }

  next(error);
});

module.exports = router;