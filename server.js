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

// Security middleware - simplified for development
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false, // Disable for development
}));

// Compression middleware
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.url.startsWith('/uploads/');
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP, please try again later.'
  },
  skipSuccessfulRequests: true,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: 'Too many file uploads from this IP, please try again later.'
  }
});

// CORS configuration - Allow all for development
app.use(cors({
  origin: true, // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '1d'
}));

// Request logging middleware (development)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Health check endpoint (before other routes)
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    uptime: process.uptime()
  });
});

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'College Resource Hub API',
    version: '1.0.0',
    endpoints: {
      'GET /api/health': 'Health check',
      'POST /api/auth/register': 'Register a new user',
      'POST /api/auth/login': 'Login user',
      'GET /api/resources': 'Get all resources',
      'POST /api/resources': 'Upload new resource (auth required)',
      'POST /api/ratings': 'Rate a resource (auth required)',
      'GET /api/users/dashboard': 'Get dashboard stats (auth required)',
    }
  });
});

// Routes with rate limiting applied individually
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/resources', uploadLimiter, resourceRoutes);
app.use('/api/ratings', limiter, ratingRoutes);
app.use('/api/users', limiter, userRoutes);

// Serve static frontend files
const frontendBuildPath = path.join(__dirname, 'public');
if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath));
  
  // Handle React Router - serve index.html for non-API routes
  app.get('/', (req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
}

// Handle 404 for API routes - specific middleware without wildcards
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') && !res.headersSent) {
    return res.status(404).json({
      success: false,
      message: 'API endpoint not found',
      requestedPath: req.originalUrl,
      availableEndpoints: [
        'GET /api',
        'GET /api/health',
        'POST /api/auth/register',
        'POST /api/auth/login',
        'GET /api/resources',
        'POST /api/resources',
        'POST /api/ratings',
        'GET /api/users/dashboard'
      ]
    });
  }
  next();
});

// Global error handling middleware
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);

  // Don't send error if response already sent
  if (res.headersSent) {
    return next(error);
  }

  // Handle different types of errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }))
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
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Start server
const server = app.listen(PORT, () => {
  console.log('=====================================');
  console.log('🚀 College Resource Hub API Server');
  console.log('=====================================');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 Database: ${process.env.MONGODB_URI ? 'MongoDB configured' : 'Local MongoDB'}`);
  console.log('=====================================');
  console.log(`📋 API Documentation: http://localhost:${PORT}/api`);
  console.log(`❤️  Health Check: http://localhost:${PORT}/api/health`);
  console.log(`📁 Frontend: http://localhost:${PORT}`);
  console.log('=====================================');
  
  if (process.env.NODE_ENV === 'development') {
    console.log('🔧 Development mode - detailed logging enabled');
    console.log(`📂 Uploads directory: ${path.join(__dirname, 'uploads')}`);
    console.log('=====================================');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  if (server) {
    server.close(() => {
      console.log('Process terminated');
    });
  }
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  if (server) {
    server.close(() => {
      console.log('Process terminated');
    });
  }
});

module.exports = app;