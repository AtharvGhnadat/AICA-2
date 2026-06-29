export default async function handler(req, res) {
  // Add CORS headers for Vercel
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { question, serperApiKey } = req.body;

  if (!question) {
    return res.status(400).json({ success: false, error: 'Question is required' });
  }

  let query = question.replace(/^(what is|what's|who is|who's|explain|tell me about|show me|how does|what does|diagram of|picture of|image of|can you show( me)?( a)?( picture| image)?( of)?)\s+/i, '')
    .replace(/^(a|an|the)\s+/i, '')
    .replace(/\?$/, '')
    .trim();
  
  let rawTitle = query.charAt(0).toUpperCase() + query.slice(1);
  
  const apiKey = serperApiKey || process.env.SERPER_API_KEY || process.env.VITE_SERPER_API_KEY;
  
  if (!apiKey) {
    return res.status(400).json({ success: false, error: 'Serper API key not configured' });
  }

  try {
    const response = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: query,
        gl: 'in',
        hl: 'en',
        num: 10
      })
    });

    const data = await response.json();
    const results = data.images;

    if (!results || results.length === 0) {
      return res.status(404).json({ success: false, error: 'No image found' });
    }

    let bestImage = results[0];
    for (let i = 0; i < Math.min(5, results.length); i++) {
       if (results[i].imageUrl && !results[i].imageUrl.includes('fbsbx.com') && !results[i].imageUrl.includes('lookaside')) {
         bestImage = results[i];
         break;
       }
    }
    
    return res.status(200).json({
      success: true,
      imageUrl: bestImage.imageUrl || bestImage.thumbnailUrl,
      thumbnailUrl: bestImage.thumbnailUrl,
      title: rawTitle || 'Visual Context',
      explanation: '',
      searchQuery: query,
      imageSource: 'serper'
    });

  } catch (error) {
    console.error('Vercel API error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch image from Serper' });
  }
}
