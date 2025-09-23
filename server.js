const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import database connection
const connectDB = require('./config/db');

// Import routes
const authRoutes = require('./routes/auth');
const resourceRoutes = require('./routes/resources');
const ratingRoutes = require('./routes/ratings');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to database
connectDB();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
const resourcesDir = path.join(uploadsDir, 'resources');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(resourcesDir)) {
  fs.mkdirSync(resourcesDir, { recursive: true });
}

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: false, // Allow file downloads
}));

// Compression middleware
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP, please try again later.'
  }
});

// File upload rate limiting
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 uploads per hour
  message: {
    success: false,
    message: 'Too many file uploads from this IP, please try again later.'
  }
});

app.use(limiter);

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = process.env.CORS_ORIGIN 
      ? process.env.CORS_ORIGIN.split(',')
      : ['http://localhost:3000', 'http://localhost:3001'];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '1d', // Cache for 1 day
  setHeaders: (res, path) => {
    // Set appropriate headers for file downloads
    if (path.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
    } else if (path.endsWith('.doc') || path.endsWith('.docx')) {
      res.setHeader('Content-Type', 'application/msword');
    }
  }
}));

// Request logging middleware (development)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/resources', uploadLimiter, resourceRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/users', userRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'College Resource Hub API',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/register': 'Register a new user',
        'POST /api/auth/login': 'Login user',
        'GET /api/auth/profile': 'Get user profile (auth required)',
        'PUT /api/auth/profile': 'Update user profile (auth required)',
        'POST /api/auth/change-password': 'Change password (auth required)',
        'POST /api/auth/verify-token': 'Verify JWT token (auth required)',
        'POST /api/auth/logout': 'Logout user (auth required)'
      },
      resources: {
        'GET /api/resources': 'Get all resources with filtering',
        'GET /api/resources/:id': 'Get single resource',
        'POST /api/resources': 'Upload new resource (auth required)',
        'PUT /api/resources/:id': 'Update resource (auth required)',
        'DELETE /api/resources/:id': 'Delete resource (auth required)',
        'GET /api/resources/:id/download': 'Download resource (auth required)',
        'GET /api/resources/top-rated': 'Get top rated resources',
        'GET /api/resources/most-downloaded': 'Get most downloaded resources',
        'GET /api/resources/recent': 'Get recent resources'
      },
      ratings: {
        'POST /api/ratings': 'Rate a resource (auth required)',
        'GET /api/ratings/resource/:resourceId': 'Get ratings for resource',
        'GET /api/ratings/user/:userId': 'Get user ratings',
        'GET /api/ratings/my-ratings': 'Get current user ratings (auth required)',
        'PUT /api/ratings/:id': 'Update rating (auth required)',
        'DELETE /api/ratings/:id': 'Delete rating (auth required)',
        'POST /api/ratings/:id/helpful': 'Mark rating as helpful (auth required)',
        'POST /api/ratings/:id/report': 'Report rating (auth required)'
      },
      users: {
        'GET /api/users/dashboard': 'Get dashboard stats (auth required)',
        'GET /api/users/my-resources': 'Get user resources (auth required)',
        'GET /api/users/subjects': 'Get all subjects',
        'GET /api/users/semesters': 'Get all semesters',
        'GET /api/users/resource-types': 'Get all resource types',
        'GET /api/users/profile/:userId': 'Get public user profile',
        'GET /api/users/leaderboard': 'Get user leaderboard'
      },
      utility: {
        'GET /api/health': 'Health check',
        'GET /api': 'API documentation'
      }
    }
  });
});

// 404 handler for API routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({
      success: false,
      message: 'API endpoint not found',
      requestedPath: req.originalUrl
    });
  } else {
    next();
  }
});

// Serve static files from frontend build (if exists)
if (fs.existsSync(path.join(__dirname, '../frontend/build'))) {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  
  // Handle React Router (return all non-api requests to React app)
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
  });
}

// Global error handling middleware
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);

  // Handle different types of errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: Object.values(error.errors).map(err => err.message)
    });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format'
    });
  }

  if (error.code === 11000) {
    return res.status(400).json({
      success: false,
      message: 'Duplicate field value entered'
    });
  }

  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired'
    });
  }

  // Default error
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error('Unhandled Promise Rejection:', err);
  // Close server & exit process
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log('=====================================');
  console.log('🚀 College Resource Hub API Server');
  console.log('=====================================');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 Database: ${process.env.MONGODB_URI ? 'Connected' : 'Local MongoDB'}`);
  console.log('=====================================');
  console.log(`📋 API Documentation: http://localhost:${PORT}/api`);
  console.log(`❤️  Health Check: http://localhost:${PORT}/api/health`);
  console.log('=====================================');
});

module.exports = app;