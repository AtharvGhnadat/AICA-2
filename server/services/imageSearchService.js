import axios from 'axios';

// Helper to convert questions to better image search queries
function enhanceSearchQuery(question) {
  const lowerQ = question.toLowerCase();
  
  // Educational terms check
  const isScience = /photosynthesis|water cycle|human heart|solar system|cell|atom|gravity/.test(lowerQ);
  const isHistory = /shivaji maharaj|mahatma gandhi|lincoln|history/.test(lowerQ);

  let query = lowerQ
    .replace(/^(what is|what's|who is|who's|explain|tell me about|show me|how does|what does|diagram of|picture of|image of|can you show( me)?( a)?( picture| image)?( of)?)\s+/i, '')
    .replace(/^(a|an|the)\s+/i, '')
    .replace(/[?.,]/g, '')
    .trim();

  if (isScience) {
    query += ' educational diagram for students';
  } else if (isHistory) {
    query += ' portrait';
  }
  
  return query;
}

export async function searchImage(question, serperApiKey = '') {
  let rawTitle = question.replace(/^(what is|what's|who is|who's|explain|tell me about|show me|how does|what does|diagram of|picture of|image of|can you show( me)?( a)?( picture| image)?( of)?)\s+/i, '')
    .replace(/^(a|an|the)\s+/i, '')
    .replace(/\?$/, '')
    .trim();
  rawTitle = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);
  
  // 1. Attempt ultra-fast Wikipedia search first (usually ~100ms)
  try {
    const wikiTitle = encodeURIComponent(rawTitle.replace(/ /g, '_'));
    const wikiResponse = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`, { timeout: 1500 });
    if (wikiResponse.data && wikiResponse.data.originalimage && wikiResponse.data.originalimage.source) {
      return {
        success: true,
        imageUrl: wikiResponse.data.originalimage.source,
        thumbnailUrl: wikiResponse.data.thumbnail?.source || wikiResponse.data.originalimage.source,
        title: wikiResponse.data.title || rawTitle,
        explanation: wikiResponse.data.extract || `Here is an educational visual representation related to "${rawTitle}".`,
        searchQuery: question,
        imageSource: 'wikipedia'
      };
    }
  } catch (err) {
    // Silently fall back to SerpApi if Wikipedia fails or has no image
  }

  // 2. Fallback to Serper.dev
  const apiKey = serperApiKey || process.env.SERPER_API_KEY;
  if (!apiKey) {
    return { success: false, reason: 'Serper API key not configured', searchQuery: question };
  }

  const query = enhanceSearchQuery(question);

  try {
    const response = await axios.post('https://google.serper.dev/images', 
      { q: query },
      {
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    const results = response.data.images;
    if (!results || results.length === 0) {
      return { success: false, reason: 'No image found', searchQuery: query };
    }

    const bestImage = results[0];
    
    return {
      success: true,
      imageUrl: bestImage.imageUrl || bestImage.thumbnailUrl,
      thumbnailUrl: bestImage.thumbnailUrl,
      title: rawTitle || 'Visual Context',
      explanation: `Here is an educational visual representation related to "${rawTitle}".`,
      searchQuery: query,
      imageSource: 'serper'
    };

  } catch (error) {
    console.error('SerpApi error:', error.message);
    return { success: false, reason: 'Failed to fetch image', searchQuery: query };
  }
}
