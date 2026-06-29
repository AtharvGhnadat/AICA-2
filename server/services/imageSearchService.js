import axios from 'axios';

export async function searchImage(question, serperApiKey = '') {
  let query = question.replace(/^(what is|what's|who is|who's|explain|tell me about|show me|how does|what does|diagram of|picture of|image of|can you show( me)?( a)?( picture| image)?( of)?)\s+/i, '')
    .replace(/^(a|an|the)\s+/i, '')
    .replace(/\?$/, '')
    .trim();
  
  // Capitalize title for the UI
  let rawTitle = query.charAt(0).toUpperCase() + query.slice(1);
  
  // Use Serper.dev exclusively as requested by user
  const apiKey = serperApiKey || process.env.SERPER_API_KEY;
  if (!apiKey) {
    return { success: false, reason: 'Serper API key not configured', searchQuery: question };
  }

  try {
    const response = await axios.post('https://google.serper.dev/images', 
      { 
        q: query,
        gl: 'in',
        hl: 'en',
        num: 10
      },
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

    // Attempt to avoid tiny thumbnails and bad sites
    let bestImage = results[0];
    for (let i = 0; i < Math.min(5, results.length); i++) {
       if (results[i].imageUrl && !results[i].imageUrl.includes('fbsbx.com') && !results[i].imageUrl.includes('lookaside')) {
         bestImage = results[i];
         break;
       }
    }
    
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
    console.error('Serper API error:', error.message);
    return { success: false, reason: 'Failed to fetch image', searchQuery: query };
  }
}
