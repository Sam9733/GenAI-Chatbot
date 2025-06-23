import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Send, Bot, User, RefreshCw, Info, Gitlab, Edit3, MessageSquare } from 'lucide-react';
import config from './config';
import './App.css';

// Simple logging utility
const logger = {
  info: (message) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[INFO] ${new Date().toISOString()}: ${message}`);
    }
  },
  error: (message, error) => {
    console.error(`[ERROR] ${new Date().toISOString()}: ${message}`, error);
  }
};

function App() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [systemStatus, setSystemStatus] = useState(null);
  const [showStatus, setShowStatus] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Check system health on component mount
  useEffect(() => {
    checkSystemHealth();
  }, []);

  const checkSystemHealth = async () => {
    try {
      const response = await axios.get(config.getApiUrl('/api/chat/health'));
      setSystemStatus(response.data);
    } catch (error) {
      logger.error('Health check failed:', error);
      setSystemStatus({ status: 'unhealthy', error: error.message });
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = {
      id: Date.now().toString(),
      text: inputMessage.trim(),
      sender: 'user',
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.post(config.getApiUrl('/api/chat/message'), {
        message: userMessage.text,
        conversationId: conversationId 
      });

      // Update conversation ID from response to maintain session
      setConversationId(response.data.conversationId);

      const botMessage = {
        id: response.data.id,
        text: response.data.message,
        sender: 'bot',
        timestamp: response.data.timestamp,
        sources: response.data.sources
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      logger.error('Error sending message:', error);
      setError(error.response?.data?.message || 'Failed to send message. Please try again.');
      
      const errorMessage = {
        id: Date.now().toString(),
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'bot',
        timestamp: new Date().toISOString(),
        isError: true
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      sendMessage(e);
    }
  };

  const refreshData = async () => {
    try {
      setIsLoading(true);
      await axios.post(config.getApiUrl('/api/chat/refresh-data'));
      await checkSystemHealth();
      setError(null);
    } catch (error) {
      setError('Failed to refresh data');
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
    setConversationId(null); // Reset conversation on clear
  };

  const handleInfoClick = () => {
    setShowStatus((prev) => !prev);
    if (!showStatus) checkSystemHealth();
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <Gitlab className="logo-icon" />
            <h1>GenAI Chatbot</h1>
          </div>
          <div className="header-actions">
            <button 
              className="refresh-btn" 
              onClick={refreshData}
              disabled={isLoading}
              title="Refresh GitLab data"
            >
              <RefreshCw className={isLoading ? 'spinning' : ''} />
            </button>
            <button 
              className="info-btn" 
              onClick={handleInfoClick}
              title="System status"
            >
              <Info />
            </button>
          </div>
        </div>
        {showStatus && systemStatus && (
          <div className={`status-bar custom-status-bar ${systemStatus.status}`}>
            <span>Status: {systemStatus.status}</span>
            {systemStatus.geminiApi && (
              <span>• Gemini API: {systemStatus.geminiApi}</span>
            )}
            {systemStatus.gitlabData && (
              <span>• GitLab Data: {systemStatus.gitlabData.handbook}</span>
            )}
            {systemStatus.refreshStatus && (
              <span>• Refreshing: {systemStatus.refreshStatus.isRefreshing ? 'Yes' : 'No'}</span>
            )}
            {systemStatus.refreshStatus && systemStatus.refreshStatus.lastRefreshError && (
              <span style={{ color: '#dc2626' }}>• Refresh Error: {systemStatus.refreshStatus.lastRefreshError}</span>
            )}
          </div>
        )}
      </header>

      {/* Main Chat Area */}
      <main className="chat-container">
        <div className="messages-container">
          {messages.length === 0 && (
            <div className="welcome-message">
              <Bot className="welcome-icon" />
              <h2>Welcome to GitLab Assistant!</h2>
              <p>I'm here to help you learn about GitLab's culture, policies, and strategic direction.</p>
              <p>Ask me anything about GitLab's "build in public" philosophy, company policies, or strategic direction!</p>
              <div className="example-questions">
                <h3>Example questions:</h3>
                <ul>
                  <li>"What is GitLab's build in public philosophy?"</li>
                  <li>"Tell me about GitLab's company values"</li>
                  <li>"What are GitLab's strategic priorities?"</li>
                  <li>"How does GitLab handle remote work?"</li>
                </ul>
              </div>
            </div>
          )}
          
          {messages.map((message, index) => (
            <div 
              key={message.id} 
              className={`message ${message.sender} ${message.isError ? 'error' : ''} fade-in`}
            >
              <div className="message-avatar">
                {message.sender === 'user' ? <User /> : <Bot />}
              </div>
              <div className="message-content">
                <div className="message-text">{message.text}</div>
                {message.sources && (
                  <div className="message-sources">
                    <small>Sources: GitLab Handbook & Direction pages</small>
                  </div>
                )}
                <div className="message-timestamp">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="message bot loading fade-in">
              <div className="message-avatar">
                <Bot />
              </div>
              <div className="message-content">
                <div className="message-text">
                  <span className="loading-dots">Thinking</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Error Display */}
        {error && (
          <div className="error-message">
            <span>{error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        {/* Input Area */}
        <form className="input-container" onSubmit={sendMessage}>
          <div className="input-wrapper">
            <textarea
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask me about GitLab's culture, policies, or strategic direction..."
              disabled={isLoading}
              rows="1"
              className="message-input"
            />
            <button 
              type="submit" 
              disabled={!inputMessage.trim() || isLoading}
              className="send-button"
            >
              <Send />
            </button>
          </div>
          <div className="input-actions">
            <button 
              type="button" 
              onClick={clearChat}
              className="clear-btn"
              disabled={messages.length === 0}
            >
              Clear Chat
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default App; 