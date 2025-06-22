# Deployment Guide for GenAI Chatbot

## Overview
This guide covers deploying your GenAI Chatbot with:
- **Frontend**: React app on Netlify
- **Backend**: Node.js/Express on Render/Heroku/Railway

## Prerequisites
1. GitHub repository with your code
2. Netlify account (free)
3. Render/Heroku/Railway account for backend

## Step 1: Deploy Backend First

### Option A: Render (Recommended)
1. Go to [render.com](https://render.com) and sign up
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: `genai-chatbot-backend`
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
   - **Environment**: Node
5. Add Environment Variables:
   - `GEMINI_API_KEY`: Your Gemini API key
   - `PORT`: `5000` (optional, Render sets this automatically)
6. Click "Create Web Service"
7. Wait for deployment and copy the URL (e.g., `https://your-app.onrender.com`)

### Option B: Heroku
1. Install Heroku CLI
2. Run in `server` directory:
   ```bash
   heroku create your-app-name
   heroku config:set GEMINI_API_KEY=your-api-key
   git push heroku main
   ```

### Option C: Railway
1. Go to [railway.app](https://railway.app)
2. Connect GitHub repository
3. Set root directory to `server`
4. Add environment variables
5. Deploy

## Step 2: Deploy Frontend to Netlify

### Method 1: Git Integration (Recommended)
1. Go to [netlify.com](https://netlify.com) and sign up
2. Click "New site from Git"
3. Choose GitHub and select your repository
4. Configure build settings:
   - **Base directory**: `client`
   - **Build command**: `npm run build`
   - **Publish directory**: `build`
5. Add Environment Variables:
   - `REACT_APP_API_URL`: Your backend URL (e.g., `https://your-app.onrender.com`)
6. Click "Deploy site"

### Method 2: Manual Upload
1. Build your React app:
   ```bash
   cd client
   npm run build
   ```
2. Go to Netlify dashboard
3. Drag and drop the `build` folder
4. Add environment variables in site settings

## Step 3: Configure Custom Domain (Optional)
1. In Netlify dashboard, go to "Domain settings"
2. Add custom domain
3. Configure DNS as instructed
4. Enable HTTPS (automatic)

## Step 4: Test Your Deployment
1. Visit your Netlify URL
2. Test the chat functionality
3. Check that API calls work
4. Verify environment variables are set correctly

## Environment Variables Reference

### Backend (Render/Heroku/Railway)
- `GEMINI_API_KEY`: Your Google Gemini API key
- `PORT`: Port number (usually auto-set)

### Frontend (Netlify)
- `REACT_APP_API_URL`: Full URL to your backend (e.g., `https://your-app.onrender.com`)

## Troubleshooting

### Common Issues:
1. **CORS errors**: Ensure backend allows requests from your Netlify domain
2. **API not found**: Check `REACT_APP_API_URL` environment variable
3. **Build failures**: Check Node.js version compatibility
4. **Environment variables not working**: Restart deployment after adding variables

### Debug Steps:
1. Check browser console for errors
2. Verify backend is running and accessible
3. Test API endpoints directly
4. Check environment variables in deployment dashboard

## Updating Your App
- **Code changes**: Push to GitHub → Auto-deploy
- **Environment variables**: Update in deployment dashboard → Restart service
- **Domain changes**: Update in Netlify dashboard

## Cost Considerations
- **Netlify**: Free tier includes 100GB bandwidth/month
- **Render**: Free tier includes 750 hours/month
- **Heroku**: Free tier discontinued, paid plans start at $7/month
- **Railway**: Free tier includes $5 credit/month 