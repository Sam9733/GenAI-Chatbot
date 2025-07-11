const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/database');

// Allow CORS for Netlify frontend and localhost
const allowedOrigins = [
  'https://gitlab-genai-chatbot.netlify.app',
  'http://localhost:3000'
];

const corsOptions = {
  origin: allowedOrigins,
  credentials: true
};

// Connect to MongoDB
connectDB();

const app = express();
const PORT = process.env.PORT || 5000;

// Simple logging utility
const logger = {
  info: (message) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[INFO] ${new Date().toISOString()}: ${message}`);
    }
  },
  error: (message, error) => {
    console.error(`[ERROR] ${new Date().toISOString()}: ${message}`, error?.message || error);
  }
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' })); // Add size limit

// Import routes
const { router: chatRoutes, backgroundRefresh } = require('./routes/chat');

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'GenAI Chatbot API is running',
    timestamp: new Date().toISOString()
  });
});

// Use API routes
app.use('/api/chat', chatRoutes);

// Serve static files from React build only in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Something went wrong!',
    ...(process.env.NODE_ENV === 'development' && { message: err.message })
  });
});

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/api/health`);
  // Trigger initial data scrape on startup
  logger.info('Triggering initial data scrape in the background...');
  backgroundRefresh();
});
