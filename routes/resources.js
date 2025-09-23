const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Resource = require('../models/Resource');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

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
    cb(null, uniqueSuffix + '-' + file.originalname);
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
    'image/png'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, DOC, DOCX, PPT, PPTX, TXT, JPG, PNG files are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: fileFilter
});

// Get all resources with filtering and search
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
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
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
    if (sortBy === 'rating') {
      sort.averageRating = order === 'desc' ? -1 : 1;
    } else if (sortBy === 'downloads') {
      sort.downloadCount = order === 'desc' ? -1 : 1;
    } else if (sortBy === 'title') {
      sort.title = order === 'desc' ? -1 : 1;
    } else {
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

// Get single resource by ID
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

// Upload new resource
router.post('/', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { title, description, subject, semester, type, tags } = req.body;

    // Validate required fields
    if (!title || !description || !subject || !semester || !type) {
      // Delete uploaded file if validation fails
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'All fields are required: title, description, subject, semester, type'
      });
    }

    // Process tags
    let tagArray = [];
    if (tags) {
      tagArray = tags.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0);
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
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    
    console.error('Upload resource error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while uploading resource'
    });
  }
});

// Update resource (only by author)
router.put('/:id', auth, async (req, res) => {
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
    if (title) resource.title = title.trim();
    if (description) resource.description = description.trim();
    if (subject) resource.subject = subject;
    if (semester) resource.semester = semester;
    if (type) resource.type = type;
    if (tags) {
      resource.tags = tags.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0);
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

// Delete resource (only by author)
router.delete('/:id', auth, async (req, res) => {
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

// Download resource
router.get('/:id/download', auth, async (req, res) => {
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

    // Stream file to client
    const fileStream = fs.createReadStream(resource.filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Download resource error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while downloading resource'
    });
  }
});

// Get top-rated resources
router.get('/top-rated', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const resources = await Resource.find({ isActive: true })
      .populate('author', 'name university')
      .sort({ averageRating: -1, totalRatings: -1 })
      .limit(limit);

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

// Get most downloaded resources
router.get('/most-downloaded', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const resources = await Resource.find({ isActive: true })
      .populate('author', 'name university')
      .sort({ downloadCount: -1 })
      .limit(limit);

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

// Get recent resources
router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const resources = await Resource.find({ isActive: true })
      .populate('author', 'name university')
      .sort({ createdAt: -1 })
      .limit(limit);

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

module.exports = router;