// Configuration for API endpoints
const config = {
  // Use proxy in development, full URL in production
  apiBaseUrl: process.env.NODE_ENV === 'production' 
    ? process.env.REACT_APP_API_URL || 'https://your-backend-url.onrender.com'
    : '', // Empty string uses the proxy in development
  
  // Helper function to get full API URL
  getApiUrl: (endpoint) => {
    return `${config.apiBaseUrl}${endpoint}`;
  }
};

export default config; 