import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { searchImage } from './services/imageSearchService.js';
import { checkRelevance } from './services/topicService.js';
import { checkHealth } from './services/healthService.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

app.post('/api/image-search', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ success: false, reason: 'Question is required' });
    }
    const result = await searchImage(question);
    res.json(result);
  } catch (error) {
    console.error('Image search error:', error);
    res.status(500).json({ success: false, reason: 'Internal server error' });
  }
});

app.post('/api/topic-relevance', (req, res) => {
  try {
    const { currentTopic, newUserText } = req.body;
    if (!newUserText) {
      return res.status(400).json({ success: false, reason: 'newUserText is required' });
    }
    const result = checkRelevance(currentTopic, newUserText);
    res.json(result);
  } catch (error) {
    console.error('Topic relevance error:', error);
    res.status(500).json({ success: false, reason: 'Internal server error' });
  }
});

app.get('/api/health', (req, res) => {
  const status = checkHealth();
  res.json(status);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
