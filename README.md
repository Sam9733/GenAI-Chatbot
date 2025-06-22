# GenAI Chatbot - GitLab Assistant

A modern, interactive chatbot that helps employees and aspiring employees learn about GitLab's culture, policies, and strategic direction. Built with React, Node.js, Express, and powered by Google's Gemini AI.

## 🚀 Features

- **AI-Powered Responses**: Uses Google's Gemini AI to provide intelligent, contextual responses
- **GitLab Data Integration**: Scrapes and processes data from GitLab's Handbook and Direction pages
- **Modern UI/UX**: Beautiful, responsive chat interface with smooth animations
- **Real-time Chat**: Seamless conversation flow with typing indicators and timestamps
- **Error Handling**: Robust error handling and user feedback
- **System Health Monitoring**: Built-in health checks and status monitoring
- **Data Refresh**: Manual data refresh capability for updated information
- **Mobile Responsive**: Optimized for all device sizes

## 🛠️ Tech Stack

### Frontend
- **React 18** - Modern UI framework
- **Axios** - HTTP client for API communication
- **Lucide React** - Beautiful icons
- **CSS3** - Custom styling with animations

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web framework
- **Google Generative AI** - Gemini API integration
- **Cheerio** - Web scraping library
- **Axios** - HTTP client for external requests

### Development Tools
- **Nodemon** - Development server with auto-reload
- **Concurrently** - Run multiple commands simultaneously

## 📋 Prerequisites

Before running this project, make sure you have:

- **Node.js** (v16 or higher)
- **npm** (v8 or higher)
- **Google Gemini API Key** (free tier available)

## 🔧 Installation

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd GenAI-Chatbot
```

### 2. Install Dependencies

Install both server and client dependencies:

```bash
# Install server dependencies
npm install

# Install client dependencies
npm run install-client
```

Or install everything at once:

```bash
npm run install-all
```

### 3. Environment Configuration

Create a `.env` file in the root directory:

```bash
cp env.example .env
```

Edit the `.env` file and add your Gemini API key:

```env
# Gemini API Configuration
GEMINI_API_KEY=your_actual_gemini_api_key_here

# Server Configuration
PORT=5000
NODE_ENV=development
```

### 4. Get Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Create a new API key
4. Copy the key and paste it in your `.env` file

**Note**: Gemini API offers 1,500 free API calls per day, which is sufficient for development and testing.

## 🚀 Running the Application

### Development Mode

Run both server and client in development mode:

```bash
npm run dev
```

This will start:
- **Backend server** on `http://localhost:5000`
- **Frontend client** on `http://localhost:3000`

### Production Mode

Build and run in production:

```bash
# Build the React app
npm run build

# Start the production server
npm start
```

### Individual Commands

```bash
# Run only the backend server
npm run server

# Run only the frontend client
npm run client

# Build the React app
npm run build
```

## 📡 API Endpoints

### Chat Endpoints

- `POST /api/chat/message` - Send a message to the chatbot
- `GET /api/chat/health` - Check chatbot health and data status
- `POST /api/chat/refresh-data` - Manually refresh GitLab data cache

### System Endpoints

- `GET /api/health` - General system health check

## 🎯 Usage

1. **Start the application** using `npm run dev`
2. **Open your browser** and navigate to `http://localhost:3000`
3. **Ask questions** about GitLab's:
   - Build in public philosophy
   - Company values and culture
   - Strategic direction and priorities
   - Remote work policies
   - Internal processes and strategies

### Example Questions

- "What is GitLab's build in public philosophy?"
- "Tell me about GitLab's company values"
- "What are GitLab's strategic priorities?"
- "How does GitLab handle remote work?"
- "What is GitLab's approach to transparency?"

## 🏗️ Project Structure

```
GenAI-Chatbot/
├── client/                 # React frontend
│   ├── public/            # Static files
│   │   └── index.html     # HTML template
│   ├── src/               # React source code
│   │   ├── App.js         # Main App component
│   │   ├── App.css        # App styles
│   │   ├── index.js       # React entry point
│   │   └── index.css      # Global styles
│   └── package.json       # Frontend dependencies
├── server/                # Node.js backend
│   ├── routes/            # API routes
│   │   └── chat.js        # Chat endpoints
│   └── index.js           # Express server
├── .env                   # Environment variables
├── env.example            # Environment template
├── package.json           # Backend dependencies
└── README.md              # Project documentation
```

## 🔒 Security Features

- **Environment Variables**: Sensitive data stored in `.env` files
- **Input Validation**: Server-side validation for all inputs
- **Error Handling**: Comprehensive error handling without exposing sensitive information
- **Rate Limiting**: Built-in protection against abuse (can be enhanced)
- **CORS Configuration**: Proper CORS setup for security

## 🚀 Deployment

### Vercel Deployment (Recommended)

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel
   ```

3. **Set Environment Variables** in Vercel dashboard:
   - `GEMINI_API_KEY`
   - `NODE_ENV=production`

### Other Deployment Options

- **Heroku**: Use the Procfile and build scripts
- **Railway**: Direct deployment from GitHub
- **DigitalOcean App Platform**: Container-based deployment

## 🧪 Testing

### Manual Testing

1. **Health Check**: Visit `/api/health` to verify system status
2. **Chat Functionality**: Send messages through the UI
3. **Error Handling**: Test with invalid inputs
4. **Responsive Design**: Test on different screen sizes

### API Testing

Use tools like Postman or curl:

```bash
# Health check
curl http://localhost:5000/api/health

# Send a message
curl -X POST http://localhost:5000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "What is GitLab?"}'
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `GEMINI_API_KEY` | Google Gemini API key | - | Yes |
| `PORT` | Server port | 5000 | No |
| `NODE_ENV` | Environment mode | development | No |

### Customization

- **GitLab Sources**: Modify URLs in `server/routes/chat.js`
- **AI Model**: Change model in `generateResponse()` function
- **Styling**: Customize CSS in `client/src/App.css`
- **System Prompt**: Update prompt in `server/routes/chat.js`

## 🐛 Troubleshooting

### Common Issues

1. **Gemini API Key Error**
   - Verify your API key is correct
   - Check if you've exceeded the daily limit
   - Ensure the key is properly set in `.env`

2. **Port Already in Use**
   - Change the port in `.env` file
   - Kill processes using the port: `npx kill-port 5000`

3. **GitLab Data Not Loading**
   - Check internet connection
   - Verify GitLab URLs are accessible
   - Check browser console for CORS errors

4. **React App Not Starting**
   - Clear node_modules and reinstall: `rm -rf node_modules && npm install`
   - Check for port conflicts on 3000

### Debug Mode

Enable debug logging by setting `NODE_ENV=development` in your `.env` file.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit your changes: `git commit -am 'Add feature'`
4. Push to the branch: `git push origin feature-name`
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🙏 Acknowledgments

- **GitLab** for their open documentation and "build in public" philosophy
- **Google** for providing the Gemini AI API
- **React** and **Node.js** communities for excellent tooling

## 📞 Support

If you encounter any issues or have questions:

1. Check the troubleshooting section above
2. Review the API documentation
3. Open an issue on GitHub
4. Check the system health endpoint: `/api/health`

---

**Happy coding! 🚀**

*This project embodies GitLab's "build in public" philosophy by being open, transparent, and collaborative.*