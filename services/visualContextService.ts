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
      }, 8000); // 8000ms timeout to allow fallbacks to finish gracefully

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
      
      // Fallback to Vercel Serverless Function if Raspberry Pi backend is unavailable (e.g., testing on Vercel)
      const finalSerperApiKey = serperApiKey || import.meta.env.VITE_SERPER_API_KEY || (process.env as any).SERPER_API_KEY;
      
      try {
        console.log("Attempting Serper via Vercel Serverless Function...");
        const vercelResponse = await fetch('/api/image-search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ question: trimmedQ, serperApiKey: finalSerperApiKey }),
          signal: abortController.signal
        });

        if (vercelResponse.ok) {
          const vercelData = await vercelResponse.json();
          if (vercelData.success && vercelData.imageUrl) {
            const result: Partial<VisualContext> = {
              title: vercelData.title,
              explanation: '',
              imageUrl: vercelData.imageUrl,
              thumbnailUrl: vercelData.thumbnailUrl,
              searchQuery: vercelData.searchQuery,
              imageSource: 'serper',
              active: true
            };
            if (searchCache.size >= 10) {
              const firstKey = searchCache.keys().next().value;
              if (firstKey) searchCache.delete(firstKey);
            }
            searchCache.set(trimmedQ, result);
            return result;
          }
        }
      } catch (vercelError: any) {
        if (vercelError.name !== 'AbortError') {
          console.error('Vercel API fallback failed:', vercelError);
        }
      }
        
        // Final Fallback: Wikipedia API (No API key needed, never has CORS issues)
        try {
          console.log("Attempting final fallback to Wikipedia...");
          let query = trimmedQ.replace(/^(what is|what's|who is|who's|explain|tell me about|show me|how does|what does|diagram of|picture of|image of|can you show( me)?( a)?( picture| image)?( of)?)\s+/i, '')
            .replace(/^(a|an|the)\s+/i, '')
            .replace(/\?$/, '')
            .trim();
          let rawTitle = query.charAt(0).toUpperCase() + query.slice(1);
          
          const wikiTitle = encodeURIComponent(rawTitle.replace(/ /g, '_'));
          const wikiResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`, { signal: abortController.signal });
          if (!wikiResponse.ok) return null;
          
          const wikiData = await wikiResponse.json();
          if (wikiData && wikiData.originalimage && wikiData.originalimage.source) {
            const result: Partial<VisualContext> = {
              title: wikiData.title || rawTitle,
              explanation: '', 
              imageUrl: wikiData.originalimage.source,
              thumbnailUrl: wikiData.thumbnail?.source || wikiData.originalimage.source,
              searchQuery: query,
              imageSource: 'wikipedia',
              active: true
            };
            
            if (searchCache.size >= 10) {
              const firstKey = searchCache.keys().next().value;
              if (firstKey) searchCache.delete(firstKey);
            }
            searchCache.set(trimmedQ, result);
            return result;
          }
        } catch (wikiErr: any) {
          console.error("Wikipedia final fallback failed:", wikiErr);
        }
        
        return null;
      }
    }
  }
};
