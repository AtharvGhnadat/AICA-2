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

    // 1. Try Vercel Serverless Function first (avoids CORS issues on Android entirely)
    const finalSerperApiKey = serperApiKey || import.meta.env.VITE_SERPER_API_KEY || (process.env as any).SERPER_API_KEY;
    
    try {
      console.log("Attempting Serper via Serverless API...");
      
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, 8000); // 8000ms timeout for the network requests

      // In Capacitor (Android), this hits the Vercel backend if mapped, or local relative path if bundled with Vercel API hosted somewhere.
      // We must point to the Vercel production URL for the API.
      const apiUrl = import.meta.env.VITE_VERCEL_API_URL || 'https://aica-2.vercel.app/api/image-search';

      const vercelResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ question: trimmedQ, serperApiKey: finalSerperApiKey }),
        signal: abortController.signal
      });
      
      clearTimeout(timeoutId);

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
      if (vercelError.name === 'AbortError') {
        console.log('Image search aborted or timed out.');
        return null;
      }
      console.error('Vercel API fallback failed:', vercelError);
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
      if (wikiErr.name === 'AbortError') return null;
      console.error("Wikipedia final fallback failed:", wikiErr);
    }
    
    return null;
  }
};
