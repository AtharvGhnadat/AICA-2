import { VisualContext } from '../types/visualContext';

// Simple LRU cache for memory optimization on low RAM devices (max 10 items)
const searchCache = new Map<string, Partial<VisualContext>>();
let activeAbortController: AbortController | null = null;

export const visualContextService = {
  async searchImage(question: string, serperApiKey?: string): Promise<Partial<VisualContext> | null> {
    const trimmedQ = question.trim();
    if (!trimmedQ) return null;

    if (searchCache.has(trimmedQ)) {
      return searchCache.get(trimmedQ) || null;
    }

    // Cancel any ongoing image search because user asked a new question
    if (activeAbortController) {
      activeAbortController.abort();
    }
    
    const abortController = new AbortController();
    activeAbortController = abortController;

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, 3500); // 3500ms timeout for ultra-fast UX

      const response = await fetch(`${backendUrl}/api/image-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ question: trimmedQ }),
        signal: abortController.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success || !data.imageUrl) {
        return null;
      }

      const result: Partial<VisualContext> = {
        title: data.title,
        explanation: data.explanation,
        imageUrl: data.imageUrl,
        thumbnailUrl: data.thumbnailUrl,
        searchQuery: data.searchQuery,
        imageSource: data.imageSource,
        active: true
      };

      // LRU Cache logic
      if (searchCache.size >= 10) {
        const firstKey = searchCache.keys().next().value;
        if (firstKey) searchCache.delete(firstKey);
      }
      searchCache.set(trimmedQ, result);
      
      return result;

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Image search aborted or timed out.');
        return null;
      }
      
      console.warn('Backend image search failed, falling back to direct Serper API...', error.message);
      
      // Fallback to direct client-side Serper API call if backend is unavailable (e.g. testing on Vercel)
      if (!serperApiKey) {
        console.warn('No Serper API key provided for fallback.');
        return null;
      }

      try {
        let query = trimmedQ.replace(/^(what is|what's|who is|who's|explain|tell me about|show me|how does|what does|diagram of|picture of|image of|can you show( me)?( a)?( picture| image)?( of)?)\s+/i, '')
          .replace(/^(a|an|the)\s+/i, '')
          .replace(/\?$/, '')
          .trim();
        let rawTitle = query.charAt(0).toUpperCase() + query.slice(1);

        const fallbackResponse = await fetch('https://google.serper.dev/images', {
          method: 'POST',
          headers: {
            'X-API-KEY': serperApiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ q: query, gl: 'in', hl: 'en', num: 10 }),
          signal: abortController.signal
        });

        if (!fallbackResponse.ok) return null;
        
        const fallbackData = await fallbackResponse.json();
        const results = fallbackData.images;
        
        if (!results || results.length === 0) return null;

        let bestImage = results[0];
        for (let i = 0; i < Math.min(5, results.length); i++) {
           if (results[i].imageUrl && !results[i].imageUrl.includes('fbsbx.com') && !results[i].imageUrl.includes('lookaside')) {
             bestImage = results[i];
             break;
           }
        }

        const result: Partial<VisualContext> = {
          title: rawTitle || 'Visual Context',
          explanation: '', // UI no longer uses this
          imageUrl: bestImage.imageUrl || bestImage.thumbnailUrl,
          thumbnailUrl: bestImage.thumbnailUrl,
          searchQuery: query,
          imageSource: 'serper',
          active: true
        };

        if (searchCache.size >= 10) {
          const firstKey = searchCache.keys().next().value;
          if (firstKey) searchCache.delete(firstKey);
        }
        searchCache.set(trimmedQ, result);
        
        return result;

      } catch (fallbackError: any) {
        if (fallbackError.name !== 'AbortError') {
          console.error('Direct Serper API fallback also failed:', fallbackError);
        }
        return null;
      }
    }
  }
};
