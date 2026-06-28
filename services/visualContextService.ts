import { VisualContext } from '../types/visualContext';

// Simple cache for memory optimization on low RAM devices
const searchCache = new Map<string, Partial<VisualContext>>();

function enhanceSearchQuery(question: string) {
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

export const visualContextService = {
  async searchImage(question: string, serperApiKey?: string): Promise<Partial<VisualContext> | null> {
    const trimmedQ = question.trim();
    if (!trimmedQ) return null;

    if (searchCache.has(trimmedQ)) {
      return searchCache.get(trimmedQ) || null;
    }

    let rawTitle = trimmedQ.replace(/^(what is|what's|who is|who's|explain|tell me about|show me|how does|what does|diagram of|picture of|image of|can you show( me)?( a)?( picture| image)?( of)?)\s+/i, '')
      .replace(/^(a|an|the)\s+/i, '')
      .replace(/\?$/, '')
      .trim();
    rawTitle = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);
    
    // Fire both Wikipedia and Serper requests concurrently
    const wikiPromise = (async () => {
      const wikiTitle = encodeURIComponent(rawTitle.replace(/ /g, '_'));
      const wikiResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`);
      if (wikiResponse.ok) {
        const wikiData = await wikiResponse.json();
        if (wikiData.originalimage && wikiData.originalimage.source) {
          return {
            title: wikiData.title || rawTitle,
            explanation: wikiData.extract || `Here is an educational visual representation related to "${rawTitle}".`,
            imageUrl: wikiData.originalimage.source,
            thumbnailUrl: wikiData.thumbnail?.source || wikiData.originalimage.source,
            searchQuery: trimmedQ,
            imageSource: 'wikipedia',
            active: true
          } as Partial<VisualContext>;
        }
      }
      throw new Error('Wiki failed');
    })();

    const serperPromise = (async () => {
      const apiKey = serperApiKey || import.meta.env.VITE_SERPER_API_KEY;
      if (!apiKey) throw new Error('Serper API key not configured');

      const query = enhanceSearchQuery(trimmedQ);
      const response = await fetch('https://google.serper.dev/images', {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ q: query })
      });

      if (!response.ok) throw new Error('Serper request failed');

      const data = await response.json();
      const results = data.images;
      
      if (!results || results.length === 0) {
        throw new Error('No images found via Serper');
      }

      const bestImage = results[0];
      return {
        title: rawTitle || 'Visual Context',
        explanation: `Here is an educational visual representation related to "${rawTitle}".`,
        imageUrl: bestImage.imageUrl || bestImage.thumbnailUrl,
        thumbnailUrl: bestImage.thumbnailUrl,
        searchQuery: query,
        imageSource: 'serper',
        active: true
      } as Partial<VisualContext>;
    })();

    try {
      // Return whichever resolves successfully first! (Ultra-fast)
      const result = await Promise.any([wikiPromise, serperPromise]);
      
      if (searchCache.size >= 10) {
        const firstKey = searchCache.keys().next().value;
        if (firstKey) searchCache.delete(firstKey);
      }
      searchCache.set(trimmedQ, result);
      return result;

    } catch (error) {
      console.error('All image search providers failed:', error);
      return null;
    }
  }
};
