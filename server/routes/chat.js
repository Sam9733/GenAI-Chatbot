// routes/chat.js
require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const urlModule = require('url');
const mongoose = require('mongoose');
const GitLabData = require('../models/GitLabData');

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

// Add refresh status tracking - using MongoDB instead of memory
let refreshStatus = {
  isRefreshing: false,
  lastRefreshAttempt: null,
  lastRefreshError: null,
  startTime: null
};

async function scrapeGitLabData() {
  try {
    logger.info('Starting GitLab data scraping...');
    
    // Instead of clearing existing data, we'll use a staging approach
    // Create temporary documents with new data, then swap them in
    logger.info('Starting staged refresh - preparing new data...');
    
    await scrapeAndSaveSite(GITLAB_SOURCES.handbook, 'handbook_staging');
    await scrapeAndSaveSite(GITLAB_SOURCES.direction, 'direction_staging');
    
    // Now atomically swap the staging data to production
    logger.info('Swapping staged data to production...');
    
    // Use MongoDB transactions to ensure atomicity
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Copy staging data to production
        const handbookStaging = await GitLabData.findOne({ source: 'handbook_staging' });
        const directionStaging = await GitLabData.findOne({ source: 'direction_staging' });
        
        if (handbookStaging) {
          await GitLabData.findOneAndUpdate(
            { source: 'handbook' },
            { 
              content: handbookStaging.content,
              scrapedAt: new Date()
            },
            { upsert: true, session }
          );
        }
        
        if (directionStaging) {
          await GitLabData.findOneAndUpdate(
            { source: 'direction' },
            { 
              content: directionStaging.content,
              scrapedAt: new Date()
            },
            { upsert: true, session }
          );
        }
        
        // Clean up staging data
        await GitLabData.deleteMany({ source: { $in: ['handbook_staging', 'direction_staging'] } }, { session });
      });
    } finally {
      await session.endSession();
    }
    
    logger.info('Scraping completed for all sites with atomic swap.');
  } catch (error) {
    logger.error('Error in scrapeGitLabData:', error);
    // Clean up any staging data on error
    try {
      await GitLabData.deleteMany({ source: { $in: ['handbook_staging', 'direction_staging'] } });
    } catch (cleanupError) {
      logger.error('Error cleaning up staging data:', cleanupError);
    }
    throw error;
  }
}

async function scrapeAndSaveSite(rootUrl, source, maxPages = 50, batchSize = 10) {
  logger.info(`Starting to scrape: ${rootUrl} (max ${maxPages} pages) for source: ${source}`);
  const visitedUrls = new Set();
  const queue = [rootUrl];
  let currentBatch = [];
  let totalPagesSaved = 0;

  // Initialize empty document for this source
  await GitLabData.findOneAndUpdate(
    { source },
    { 
      content: JSON.stringify({ title: '', url: rootUrl, pages: [] }),
      scrapedAt: new Date()
    },
    { upsert: true }
  );

  while (queue.length > 0 && totalPagesSaved < maxPages) {
    const url = queue.shift();
    if (visitedUrls.has(url)) {
      continue;
    }
    visitedUrls.add(url);

    let response = null;
    let attempt = 0;
    let success = false;
    while (attempt < 3 && !success) {
      try {
        await sleep(1000 + Math.random() * 1000); // Wait 1-2 seconds
        response = await axios.get(url, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        success = true;
      } catch (e) {
        attempt++;
        const isHangup = e.code === 'ECONNRESET' || (e.message && e.message.includes('socket hang up'));
        const isNetwork = e.code === 'ECONNABORTED' || e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN';
        if ((isHangup || isNetwork) && attempt < 3) {
          logger.warn(`Retrying (${attempt}/3) for ${url} due to network error: ${e.message}`);
          await sleep(1500 * attempt); // Exponential backoff
        } else {
          logger.warn(`Error scraping ${url}: ${e.message}`);
          break;
        }
      }
    }
    if (!success) continue;

    const $ = cheerio.load(response.data);
    $('script, style, nav, footer, header').remove();
    const text = $('body').text().trim().replace(/\s+/g, ' ');
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled';
    
    if (text.length > 100) {
      currentBatch.push({ 
        url, 
        title, 
        text: text.substring(0, 5000)
      });

      // Save batch if we've reached batchSize or this is the last page
      if (currentBatch.length >= batchSize || totalPagesSaved + currentBatch.length >= maxPages) {
        try {
          // Get existing data
          const existingDoc = await GitLabData.findOne({ source });
          let existingData;
          try {
            existingData = existingDoc && existingDoc.content ? JSON.parse(existingDoc.content) : { title: '', url: rootUrl, pages: [] };
          } catch (e) {
            logger.warn(`Invalid JSON in existing content for ${source}, starting fresh`);
            existingData = { title: '', url: rootUrl, pages: [] };
          }
          
          // Append new batch to existing pages
          existingData.pages = [...existingData.pages, ...currentBatch];
          
          // Save updated data
          await GitLabData.findOneAndUpdate(
            { source },
            { 
              content: JSON.stringify(existingData),
              scrapedAt: new Date()
            },
            { upsert: true }
          );

          totalPagesSaved += currentBatch.length;
          logger.info(`Saved batch of ${currentBatch.length} pages for ${source}. Total pages: ${totalPagesSaved}`);
          currentBatch = []; // Clear the batch
        } catch (error) {
          logger.error(`Error saving batch for ${source}:`, error);
          throw error;
        }
      }
    }

    if (totalPagesSaved < maxPages) {
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
      queue.push(...newLinks.slice(0, 5));
    }
  }

  // Save any remaining pages in the last batch
  if (currentBatch.length > 0) {
    try {
      const existingDoc = await GitLabData.findOne({ source });
      const existingData = existingDoc ? JSON.parse(existingDoc.content) : { title: '', url: rootUrl, pages: [] };
      existingData.pages = [...existingData.pages, ...currentBatch];
      
      await GitLabData.findOneAndUpdate(
        { source },
        { 
          content: JSON.stringify(existingData),
          scrapedAt: new Date()
        },
        { upsert: true }
      );

      totalPagesSaved += currentBatch.length;
      logger.info(`Saved final batch of ${currentBatch.length} pages for ${source}. Total pages: ${totalPagesSaved}`);
    } catch (error) {
      logger.error(`Error saving final batch for ${source}:`, error);
      throw error;
    }
  }

  logger.info(`Finished scraping ${rootUrl} for ${source}. Total pages saved: ${totalPagesSaved}`);
}

// Background refresh function
async function backgroundRefresh() {
  if (refreshStatus.isRefreshing) {
    logger.info('Refresh already in progress, skipping...');
    return { 
      success: false, 
      message: 'Refresh already in progress'
    };
  }

  refreshStatus.isRefreshing = true;
  refreshStatus.lastRefreshAttempt = new Date().toISOString();
  refreshStatus.lastRefreshError = null;
  refreshStatus.startTime = new Date().toISOString();

  try {
    logger.info('Starting background refresh...');
    await scrapeGitLabData();
    logger.info('Background refresh completed successfully');
    return { 
      success: true, 
      message: 'Refresh completed successfully'
    };
  } catch (error) {
    logger.error('Background refresh failed:', error);
    refreshStatus.lastRefreshError = error.message;
    return { 
      success: false, 
      message: 'Refresh failed: ' + error.message
    };
  } finally {
    refreshStatus.isRefreshing = false;
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getGitLabData() {
  const handbookDoc = await GitLabData.findOne({ source: 'handbook' }).select('scrapedAt');
  const directionDoc = await GitLabData.findOne({ source: 'direction' }).select('scrapedAt');

  const dataFromDB = {
    handbook: !!handbookDoc,
    direction: !!directionDoc,
    lastUpdated: handbookDoc ? handbookDoc.scrapedAt : (directionDoc ? directionDoc.scrapedAt : null),
  };
  
  // This function should only GET data, not trigger a refresh.
  // The refresh logic is handled by the /refresh-data endpoint.
  const now = new Date();
  const age = dataFromDB.lastUpdated ? now - new Date(dataFromDB.lastUpdated) : Infinity;
  
  if (age > 12 * 3600000) {
    logger.warn('Data in the database is stale. A manual refresh is recommended.');
  }
  
  return dataFromDB;
}

async function generateResponse(userMessage, context, improvementRequest = null) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const handbook = context.handbook || {}, direction = context.direction || {};
  const handbookText = (handbook.pages || []).map(p => p.text).join(' ').slice(0, 10000);
  const directionText = (direction.pages || []).map(p => p.text).join(' ').slice(0, 10000);

  let prompt;
  if (improvementRequest) {
    prompt = `
You are a thoughtful and articulate AI assistant trained on GitLab's official public documentation.

The user has requested an improvement to your previous response. Here's the context:

Previous User Question: ${userMessage}
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
  } else {
    prompt = `
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
  }

  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    logger.error('Error generating response:', error);
    throw new Error('Failed to generate response from AI model');
  }
}

router.post('/message', async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'Message is required and must be a string' });
    
    const context = await getGitLabData();
    const aiMessage = await generateResponse(message, context);
    
    // Store conversation in MongoDB
    await GitLabData.findOneAndUpdate(
      { source: 'last_conversation' },
      {
        content: JSON.stringify({
          userMessage: message,
          botResponse: aiMessage,
          timestamp: new Date().toISOString(),
          context: context
        })
      },
      { upsert: true }
    );
    
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

// Endpoint to get the last conversation
router.get('/last-conversation', async (req, res) => {
  try {
    const lastConversationDoc = await GitLabData.findOne({ source: 'last_conversation' });
    
    if (!lastConversationDoc) {
      return res.status(404).json({ error: 'No previous conversation found' });
    }
    
    const conversation = JSON.parse(lastConversationDoc.content);
    res.json({
      userMessage: conversation.userMessage,
      botResponse: conversation.botResponse,
      timestamp: conversation.timestamp
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve last conversation', message: err.message });
  }
});

// Endpoint for improving the last response
router.post('/improve', async (req, res) => {
  try {
    const { improvementRequest } = req.body;
    
    if (!improvementRequest || typeof improvementRequest !== 'string') {
      return res.status(400).json({ error: 'Improvement request is required and must be a string' });
    }
    
    // Get the last conversation from MongoDB
    const lastConversationDoc = await GitLabData.findOne({ source: 'last_conversation' });
    if (!lastConversationDoc) {
      return res.status(400).json({ error: 'No previous conversation to improve' });
    }
    
    const lastConversation = JSON.parse(lastConversationDoc.content);
    if (!lastConversation.userMessage || !lastConversation.botResponse) {
      return res.status(400).json({ error: 'Invalid previous conversation data' });
    }
    
    const improvedResponse = await generateResponse(
      lastConversation.userMessage, 
      lastConversation.context, 
      improvementRequest
    );
    
    // Update the conversation with the improved response in MongoDB
    await GitLabData.findOneAndUpdate(
      { source: 'last_conversation' },
      {
        content: JSON.stringify({
          ...lastConversation,
          botResponse: improvedResponse,
          timestamp: new Date().toISOString()
        })
      },
      { upsert: true }
    );
    
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
    logger.error('Error improving response:', err);
    res.status(500).json({ error: 'Failed to improve response', message: err.message });
  }
});

router.get('/health', async (req, res) => {
  try {

    const data = await getGitLabData();
    
    // Get memory usage in MB
    const memUsage = process.memoryUsage();
    const memoryInfo = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    };

    // Check if memory usage is concerning
    const isMemoryHigh = memoryInfo.heapUsed > (memoryInfo.heapTotal * 0.9); // Warning if heap usage > 90%

    res.json({
      status: isMemoryHigh ? 'warning' : 'healthy',
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      geminiApi: genAI ? 'configured' : 'missing',
      gitlabData: {
        handbook: data.handbook ? 'available' : 'unavailable',
        direction: data.direction ? 'available' : 'unavailable',
        lastUpdated: data.lastUpdated
      },
      refreshStatus: {
        isRefreshing: refreshStatus.isRefreshing,
        lastRefreshAttempt: refreshStatus.lastRefreshAttempt,
        lastRefreshError: refreshStatus.lastRefreshError,
        startTime: refreshStatus.startTime
      },
      memory: {
        ...memoryInfo,
        status: isMemoryHigh ? 'warning' : 'normal',
        unit: 'MB'
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error('Health check failed:', err);
    res.status(500).json({
      status: 'unhealthy', 
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/refresh-data', async (req, res) => {
  try {
    // Start background refresh
    const result = await backgroundRefresh();
    
    res.json({ 
      message: result.success ? 'GitLab data refresh started in background' : result.message,
      refreshStatus: {
        isRefreshing: refreshStatus.isRefreshing,
        lastRefreshAttempt: refreshStatus.lastRefreshAttempt,
        startTime: refreshStatus.startTime
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start refresh', message: err.message });
  }
});

module.exports = {
  router,
  backgroundRefresh
};

// Export for testing
module.exports.scrapeGitLabData = scrapeGitLabData;
