// routes/chat.js
require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const urlModule = require('url');

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Simple logging utility
const logger = {
  info: (message) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[INFO] ${new Date().toISOString()}: ${message}`);
    }
  },
  error: (message, error) => {
    console.error(`[ERROR] ${new Date().toISOString()}: ${message}`, error?.message || error);
  },
  warn: (message) => {
    console.warn(`[WARN] ${new Date().toISOString()}: ${message}`);
  }
};

const GITLAB_SOURCES = {
  handbook: 'https://handbook.gitlab.com',
  direction: 'https://about.gitlab.com/direction/'
};

let gitlabDataCache = {
  handbook: null,
  direction: null,
  lastUpdated: null
};

// Add refresh status tracking
let refreshStatus = {
  isRefreshing: false,
  lastRefreshAttempt: null,
  lastRefreshError: null
};

// Add conversation storage
let lastConversation = {
  userMessage: null,
  botResponse: null,
  timestamp: null,
  context: null
};

async function scrapeGitLabData() {
  try {
    logger.info('Starting GitLab data scraping...');
    const handbookData = await scrapeSite(GITLAB_SOURCES.handbook);
    const directionData = await scrapeSite(GITLAB_SOURCES.direction);
    
    gitlabDataCache = {
      handbook: handbookData,
      direction: directionData,
      lastUpdated: new Date().toISOString()
    };
    
    logger.info(`Scraping completed. Handbook: ${handbookData.pages.length} pages, Direction: ${directionData.pages.length} pages`);
    
    try {
      fs.writeFileSync(path.join(__dirname, 'gitlab_cache.json'), JSON.stringify(gitlabDataCache, null, 2));
      logger.info('Cache written to gitlab_cache.json');
    } catch (fileErr) {
      logger.error('Error writing cache file:', fileErr);
    }
    return gitlabDataCache;
  } catch (error) {
    logger.error('Error in scrapeGitLabData:', error);
    throw error;
  }
}

// Background refresh function
async function backgroundRefresh() {
  if (refreshStatus.isRefreshing) {
    logger.info('Refresh already in progress, skipping...');
    return;
  }

  refreshStatus.isRefreshing = true;
  refreshStatus.lastRefreshAttempt = new Date().toISOString();
  refreshStatus.lastRefreshError = null;

  try {
    logger.info('Starting background refresh...');
    await scrapeGitLabData();
    logger.info('Background refresh completed successfully');
  } catch (error) {
    logger.error('Background refresh failed:', error);
    refreshStatus.lastRefreshError = error.message;
  } finally {
    refreshStatus.isRefreshing = false;
  }
}

// Load existing cache if available
if (fs.existsSync(path.join(__dirname, 'gitlab_cache.json'))) {
  try {
    gitlabDataCache = JSON.parse(fs.readFileSync(path.join(__dirname, 'gitlab_cache.json'), 'utf8'));
    logger.info('Loaded existing cache from gitlab_cache.json');
  } catch (error) {
    logger.error('Error loading cache file:', error);
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeSite(rootUrl, maxPages = 100) {
  logger.info(`Starting to scrape: ${rootUrl} (max ${maxPages} pages)`);
  const visitedUrls = new Set();
  const queue = [rootUrl];
  const data = {
    title: '',
    url: rootUrl,
    pages: []
  };

  while (queue.length > 0 && data.pages.length < maxPages) {
    const url = queue.shift();
    
    if (visitedUrls.has(url)) {
      continue;
    }
    visitedUrls.add(url);

    try {
      // Add delay to be respectful to the server
      await sleep(1000 + Math.random() * 1000); // Wait 1-2 seconds
      
      // Only log every 10th page to reduce noise
      if (data.pages.length % 10 === 0) {
        logger.info(`Scraping progress: ${data.pages.length}/${maxPages} pages`);
      }

      const response = await axios.get(url, { 
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      const $ = cheerio.load(response.data);

      // Remove script and style elements
      $('script, style, nav, footer, header').remove();

      const text = $('body').text().trim().replace(/\s+/g, ' ');
      const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled';

      // Only add pages with meaningful content
      if (text.length > 100) {
        data.pages.push({ 
          url, 
          title, 
          text: text.substring(0, 5000) // Limit text length to avoid huge cache files
        });
      }

      // Find internal links for next iteration (but limit to avoid too many requests)
      if (data.pages.length < maxPages) {
        const newLinks = [];
        $('a[href]').each((i, el) => {
          const href = $(el).attr('href');
          if (href && !href.startsWith('mailto') && !href.startsWith('#') && !href.startsWith('javascript:')) {
            try {
              const absoluteUrl = urlModule.resolve(url, href);
              if (absoluteUrl.startsWith(rootUrl) && !visitedUrls.has(absoluteUrl)) {
                newLinks.push(absoluteUrl);
              }
            } catch (e) {
              // Skip invalid URLs
            }
          }
        });
        
        // Add only a few new links to avoid overwhelming the server
        queue.push(...newLinks.slice(0, 5));
      }
    } catch (e) {
      logger.warn(`Error scraping ${url}: ${e.message}`);
      continue;
    }
  }

  logger.info(`Finished scraping ${rootUrl}. Total pages: ${data.pages.length}`);
  return data;
}

async function getGitLabData() {
  const now = new Date();
  const age = gitlabDataCache.lastUpdated ? now - new Date(gitlabDataCache.lastUpdated) : Infinity;
  
  // Check if we need to refresh (but don't block)
  if (age > 3600000 || !gitlabDataCache.handbook || gitlabDataCache.handbook.pages.length === 0) {
    logger.info('Cache needs refresh, triggering background refresh...');
    // Start background refresh without waiting
    backgroundRefresh().catch(err => {
      logger.error('Background refresh failed:', err);
    });
  }
  
  // Return current cache immediately (even if stale)
  return gitlabDataCache;
}

async function generateResponse(userMessage, context, improvementRequest = null) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const handbook = context.handbook || {}, direction = context.direction || {};
  const handbookText = (handbook.pages || []).map(p => p.text).join(' ').slice(0, 10000);
  const directionText = (direction.pages || []).map(p => p.text).join(' ').slice(0, 10000);

  let prompt = `
You are a thoughtful and articulate AI assistant trained on GitLab's official public documentation, including the GitLab Handbook and Direction pages.

Your role is to answer the user's question using only the context provided below. You must follow these guidelines strictly:

1. Write in clear, plain English — like you're talking to a colleague or explaining to a curious user.
2. Do NOT use any formatting symbols like asterisks (*), underscores (_), hashtags (#), bullet points, or Markdown/HTML. Just write natural sentences and paragraphs.
3. Do not list items with numbers or dashes — explain them smoothly in paragraph form.
4. Avoid robotic or overly formal language. Be helpful and conversational.
5. If the answer is not found in the documentation, say so clearly and suggest visiting the official GitLab Handbook or Direction pages for more information.

Reference content:

GitLab Handbook Snippet:
${handbookText}

GitLab Direction Snippet:
${directionText}

User Question:
${userMessage}

Now write your complete answer in natural language:
`;

  // If this is an improvement request, include the previous response and feedback
  if (improvementRequest && lastConversation.botResponse) {
    prompt = `
You are a thoughtful and articulate AI assistant trained on GitLab's official public documentation.

The user has requested an improvement to your previous response. Here's the context:

Previous User Question: ${lastConversation.userMessage}
Previous Bot Response: ${lastConversation.botResponse}
User's Improvement Request: ${improvementRequest}

Please provide an improved response that addresses the user's feedback. You must follow these guidelines:

1. Write in clear, plain English — like you're talking to a colleague or explaining to a curious user.
2. Do NOT use any formatting symbols like asterisks (*), underscores (_), hashtags (#), bullet points, or Markdown/HTML. Just write natural sentences and paragraphs.
3. Do not list items with numbers or dashes — explain them smoothly in paragraph form.
4. Avoid robotic or overly formal language. Be helpful and conversational.
5. If the answer is not found in the documentation, say so clearly and suggest visiting the official GitLab Handbook or Direction pages for more information.

Reference content:

GitLab Handbook Snippet:
${handbookText}

GitLab Direction Snippet:
${directionText}

Now provide your improved response in natural language:
`;
  }

  const result = await model.generateContent(prompt);
  return result.response.text();
}

router.post('/message', async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'Message is required and must be a string' });
    
    const context = await getGitLabData();
    const aiMessage = await generateResponse(message, context);
    
    // Save the conversation
    lastConversation = {
      userMessage: message,
      botResponse: aiMessage,
      timestamp: new Date().toISOString(),
      context: context
    };
    
    res.json({
      id: Date.now().toString(),
      message: aiMessage,
      timestamp: new Date().toISOString(),
      conversationId: conversationId || Date.now().toString(),
      sources: {
        handbook: context.handbook ? GITLAB_SOURCES.handbook : null,
        direction: context.direction ? GITLAB_SOURCES.direction : null,
        lastUpdated: context.lastUpdated
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process message', message: err.message });
  }
});

// New endpoint for improving the last response
router.post('/improve', async (req, res) => {
  try {
    const { improvementRequest } = req.body;
    
    if (!improvementRequest || typeof improvementRequest !== 'string') {
      return res.status(400).json({ error: 'Improvement request is required and must be a string' });
    }
    
    if (!lastConversation.userMessage || !lastConversation.botResponse) {
      return res.status(400).json({ error: 'No previous conversation to improve' });
    }
    
    const improvedResponse = await generateResponse(
      lastConversation.userMessage, 
      lastConversation.context, 
      improvementRequest
    );
    
    // Update the conversation with the improved response
    lastConversation.botResponse = improvedResponse;
    lastConversation.timestamp = new Date().toISOString();
    
    res.json({
      id: Date.now().toString(),
      message: improvedResponse,
      timestamp: new Date().toISOString(),
      conversationId: Date.now().toString(),
      sources: {
        handbook: lastConversation.context.handbook ? GITLAB_SOURCES.handbook : null,
        direction: lastConversation.context.direction ? GITLAB_SOURCES.direction : null,
        lastUpdated: lastConversation.context.lastUpdated
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to improve response', message: err.message });
  }
});

// Endpoint to get the last conversation
router.get('/last-conversation', (req, res) => {
  if (!lastConversation.userMessage) {
    return res.status(404).json({ error: 'No previous conversation found' });
  }
  
  res.json({
    userMessage: lastConversation.userMessage,
    botResponse: lastConversation.botResponse,
    timestamp: lastConversation.timestamp
  });
});

router.get('/health', async (req, res) => {
  try {
    const data = await getGitLabData();
    res.json({
      status: 'healthy',
      geminiApi: genAI ? 'configured' : 'missing',
      gitlabData: {
        handbook: data.handbook ? 'available' : 'unavailable',
        direction: data.direction ? 'available' : 'unavailable',
        lastUpdated: data.lastUpdated
      },
      refreshStatus: {
        isRefreshing: refreshStatus.isRefreshing,
        lastRefreshAttempt: refreshStatus.lastRefreshAttempt,
        lastRefreshError: refreshStatus.lastRefreshError
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy', error: err.message });
  }
});

router.post('/refresh-data', async (req, res) => {
  try {
    // Start background refresh and return immediately
    backgroundRefresh().catch(err => {
      console.error('Manual refresh failed:', err);
    });
    
    res.json({ 
      message: 'GitLab data refresh started in background', 
      refreshStatus: {
        isRefreshing: refreshStatus.isRefreshing,
        lastRefreshAttempt: refreshStatus.lastRefreshAttempt
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start refresh', message: err.message });
  }
});

module.exports = router;

// Export for testing
module.exports.scrapeGitLabData = scrapeGitLabData;
