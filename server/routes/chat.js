// routes/chat.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const cheerio = require('cheerio');
const urlModule = require('url');
const mongoose = require('mongoose');

// Import Mongoose Models
const GitLabData = require('../models/GitLabData');
const Conversation = require('../models/Conversation');

const router = express.Router();

// Initialize Gemini AI Client
let genAI;
if (process.env.GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
} else {
  console.error('[ERROR] GEMINI_API_KEY is not set. Please add it to your .env file.');
}

// Simple logging utility
const logger = {
  info: (message) => console.log(`[INFO] ${new Date().toISOString()}: ${message}`),
  error: (message, error) => console.error(`[ERROR] ${new Date().toISOString()}: ${message}`, error?.message || error),
  warn: (message) => console.warn(`[WARN] ${new Date().toISOString()}: ${message}`),
};

const GITLAB_SOURCES = {
  handbook: 'https://handbook.gitlab.com',
  direction: 'https://about.gitlab.com/direction/',
};

// Refresh status tracking
let refreshStatus = {
  isRefreshing: false,
  lastRefreshAttempt: null,
  lastRefreshError: null,
};

async function scrapeAndStoreData() {
  if (!genAI) {
    logger.error('Cannot scrape data, Gemini API key is not configured.');
    throw new Error('Gemini API key not configured.');
  }

  try {
    logger.info('Starting GitLab data scraping...');
    const handbookContent = await scrapeSite(GITLAB_SOURCES.handbook);
    const directionContent = await scrapeSite(GITLAB_SOURCES.direction);

    // Using findOneAndUpdate with upsert: true to create/update records
    await GitLabData.findOneAndUpdate(
      { source: 'handbook' },
      { source: 'handbook', content: JSON.stringify(handbookContent), scrapedAt: new Date() },
      { upsert: true, new: true }
    );
    logger.info('Handbook data stored in MongoDB.');

    await GitLabData.findOneAndUpdate(
      { source: 'direction' },
      { source: 'direction', content: JSON.stringify(directionContent), scrapedAt: new Date() },
      { upsert: true, new: true }
    );
    logger.info('Direction data stored in MongoDB.');

    logger.info(`Scraping completed.`);
  } catch (error) {
    logger.error('Error in scrapeAndStoreData:', error);
    throw error;
  }
}

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
    await scrapeAndStoreData();
    logger.info('Background refresh completed successfully');
  } catch (error) {
    logger.error('Background refresh failed:', error);
    refreshStatus.lastRefreshError = error.message;
  } finally {
    refreshStatus.isRefreshing = false;
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeSite(rootUrl, maxPages = 100) { // Reduced max pages to be faster
  logger.info(`Starting to scrape: ${rootUrl} (max ${maxPages} pages)`);
  const visitedUrls = new Set();
  const queue = [rootUrl];
  const pages = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const url = queue.shift();
    if (visitedUrls.has(url)) continue;
    visitedUrls.add(url);

    try {
      await sleep(500); // Shorter delay
      if (pages.length % 10 === 0) {
        logger.info(`Scraping progress for ${rootUrl}: ${pages.length}/${maxPages} pages`);
      }

      const response = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      const $ = cheerio.load(response.data);
      $('script, style, nav, footer, header').remove();
      const text = $('body').text().trim().replace(/\s+/g, ' ');
      const title = $('title').text().trim() || 'Untitled';

      if (text.length > 100) {
        pages.push({ url, title, text: text.substring(0, 2000) });
      }

      if (pages.length < maxPages) {
        const newLinks = [];
        $('a[href]').each((i, el) => {
          const href = $(el).attr('href');
          if (href && !href.startsWith('mailto') && !href.startsWith('#')) {
            try {
              const absoluteUrl = urlModule.resolve(url, href);
              if (absoluteUrl.startsWith(rootUrl) && !visitedUrls.has(absoluteUrl)) newLinks.push(absoluteUrl);
            } catch (e) { /* ignore invalid URLs */ }
          }
        });
        queue.push(...newLinks.slice(0, 3)); // Grab fewer links per page
      }
    } catch (e) {
      logger.warn(`Error scraping ${url}: ${e.message}`);
    }
  }
  logger.info(`Finished scraping ${rootUrl}. Total pages: ${pages.length}`);
  return { title: `Scraped data for ${rootUrl}`, url: rootUrl, pages };
}

async function getGitLabData() {
  const handbookData = await GitLabData.findOne({ source: 'handbook' });
  const directionData = await GitLabData.findOne({ source: 'direction' });
  
  const now = new Date();
  const handbookAge = handbookData ? now - new Date(handbookData.scrapedAt) : Infinity;

  // Refresh if data is missing or older than 1 hour
  if (handbookAge > 3600000 || !handbookData || !directionData) {
    logger.info('Cache is stale or missing, triggering background refresh...');
    backgroundRefresh().catch(err => logger.error('Background refresh failed to start:', err));
  }
  
  return {
    handbook: handbookData ? JSON.parse(handbookData.content) : null,
    direction: directionData ? JSON.parse(directionData.content) : null,
    lastUpdated: handbookData ? handbookData.scrapedAt : null,
  };
}

async function generateResponse(userMessage, context, conversationHistory = []) {
  if (!genAI) throw new Error('Gemini AI client is not initialized.');
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const handbookText = (context.handbook?.pages || []).map(p => p.text).join(' \n ').slice(0, 15000);
  const directionText = (context.direction?.pages || []).map(p => p.text).join(' \n ').slice(0, 15000);

  const history = conversationHistory.map(msg => `${msg.sender}: ${msg.text}`).join('\n');

  const prompt = `You are an AI assistant for GitLab. Answer the user's question based on the provided context from the GitLab Handbook and Direction pages.
  If the answer isn't in the context, say so. Keep responses conversational and do not use markdown.

  Conversation History:
  ${history}

  Context from GitLab Handbook:
  ---
  ${handbookText}
  ---

  Context from GitLab Direction:
  ---
  ${directionText}
  ---

  New User Question: ${userMessage}

  Your Answer:`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

router.post('/message', async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required.' });
    if (!genAI) return res.status(503).json({ error: 'AI service is not configured.' });

    let conversation;
    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
    }
    
    if (!conversation) {
      conversation = new Conversation();
    }

    const userMessage = { sender: 'user', text: message };
    conversation.messages.push(userMessage);

    const context = await getGitLabData();
    const conversationHistory = conversation.messages.slice(0, -1); // Exclude the current message
    
    const aiText = await generateResponse(message, context, conversationHistory);
    
    const botMessage = { sender: 'bot', text: aiText, sources: [GITLAB_SOURCES.handbook, GITLAB_SOURCES.direction] };
    conversation.messages.push(botMessage);
    
    await conversation.save();
    
    const savedBotMessage = conversation.messages[conversation.messages.length - 1];

    res.json({
      id: savedBotMessage._id.toString(),
      message: savedBotMessage.text,
      timestamp: savedBotMessage.timestamp,
      conversationId: conversation._id.toString(), // Always return the ID for session continuity
      sources: savedBotMessage.sources
    });
  } catch (err) {
    logger.error('Failed to process message:', err);
    res.status(500).json({ error: 'Failed to process message', message: err.message });
  }
});

router.get('/health', async (req, res) => {
  try {
    const data = await getGitLabData();
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

    res.json({
      status: 'healthy',
      database: dbStatus,
      geminiApi: genAI ? 'configured' : 'missing key',
      gitlabData: {
        handbook: data.handbook ? 'available' : 'unavailable',
        direction: data.direction ? 'available' : 'unavailable',
        lastUpdated: data.lastUpdated,
      },
      refreshStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy', error: err.message });
  }
});

router.post('/refresh-data', (req, res) => {
  backgroundRefresh().catch(err => logger.error('Manual refresh failed:', err));
  res.status(202).json({ message: 'GitLab data refresh started in the background.' });
});

module.exports = router;
