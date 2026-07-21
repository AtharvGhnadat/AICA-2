import { VisualContext } from '../types';

// Simple LRU cache for memory optimization on low RAM devices (max 10 items)
const searchCache = new Map<string, Partial<VisualContext>>();
let activeAbortController: AbortController | null = null;

/**
 * Preload images into browser cache using Image() objects.
 * When the UI later renders <img src=...>, it loads instantly from cache.
 */
function preloadImages(urls: string[]) {
  for (const url of urls) {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.src = url;
  }
}

/**
 * Filter out problematic image URLs (Facebook CDN, etc.)
 */
function isValidImageUrl(url: string): boolean {
  if (!url) return false;
  return !url.includes('fbsbx.com') && !url.includes('lookaside');
}

export const visualContextService = {
  async searchImage(question: string, serperApiKey?: string): Promise<Partial<VisualContext> | null> {
    const trimmedQ = question.trim();
    if (!trimmedQ) return null;

    // Cache hit — instant return
    if (searchCache.has(trimmedQ)) {
      return searchCache.get(trimmedQ) || null;
    }

    // Cancel any ongoing image search because user asked a new question
    if (activeAbortController) {
      activeAbortController.abort();
    }
    
    const abortController = new AbortController();
    activeAbortController = abortController;

    const finalSerperApiKey = serperApiKey || import.meta.env.VITE_SERPER_API_KEY || (process.env as any).SERPER_API_KEY;

    // ─── Strategy 1: Direct Serper API call (fastest — single network hop) ───
    if (finalSerperApiKey) {
      try {
        const timeoutId = setTimeout(() => {
          abortController.abort();
        }, 4000); // 4s timeout — direct calls are fast

        const response = await fetch('https://google.serper.dev/images', {
          method: 'POST',
          headers: {
            'X-API-KEY': finalSerperApiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            q: trimmedQ,
            gl: 'in',
            hl: 'en',
            num: 5
          }),
          signal: abortController.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          console.log("Serper API Response:", data);
          const images = data.images;

          if (images && images.length > 0) {
            // Find the best valid image
            let bestImage = images[0];
            for (let i = 0; i < Math.min(5, images.length); i++) {
              if (isValidImageUrl(images[i].imageUrl)) {
                bestImage = images[i];
                break;
              }
            }

            // Preload top 3 valid images for instant display + fallback
            const preloadUrls = images
              .slice(0, 3)
              .filter((img: any) => isValidImageUrl(img.imageUrl))
              .map((img: any) => img.imageUrl);
            preloadImages(preloadUrls);

            const result: Partial<VisualContext> = {
              title: trimmedQ.charAt(0).toUpperCase() + trimmedQ.slice(1),
              explanation: '',
              imageUrl: bestImage.imageUrl || bestImage.thumbnailUrl,
              thumbnailUrl: bestImage.thumbnailUrl,
              searchQuery: trimmedQ,
              imageSource: 'serpapi',
              active: true
            };

            // LRU eviction
            if (searchCache.size >= 10) {
              const firstKey = searchCache.keys().next().value;
              if (firstKey) searchCache.delete(firstKey);
            }
            searchCache.set(trimmedQ, result);
            return result;
          }
        } else {
          const errorText = await response.text();
          console.error(`Serper API failed with status ${response.status}:`, errorText);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.log('Image search aborted or timed out.');
          return null;
        }
        console.error('Direct Serper call failed:', err);
      }
    }

    // ─── Strategy 2: Vercel Serverless Fallback (if direct Serper fails/no key) ───
    try {
      console.log("Falling back to Vercel API...");
      
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, 6000);

      const apiUrl = import.meta.env.VITE_VERCEL_API_URL || 'https://aica-2.vercel.app/api/image-search';

      const vercelResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmedQ, serperApiKey: finalSerperApiKey }),
        signal: abortController.signal
      });
      
      clearTimeout(timeoutId);

      if (vercelResponse.ok) {
        const vercelData = await vercelResponse.json();
        if (vercelData.success && vercelData.imageUrl) {
          // Preload this image
          preloadImages([vercelData.imageUrl]);

          const result: Partial<VisualContext> = {
            title: vercelData.title,
            explanation: '',
            imageUrl: vercelData.imageUrl,
            thumbnailUrl: vercelData.thumbnailUrl,
            searchQuery: vercelData.searchQuery,
            imageSource: 'serpapi',
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
    } catch (err: any) {
      if (err.name === 'AbortError') return null;
      console.error('Vercel API fallback failed:', err);
    }
      
    // ─── Strategy 3: Wikipedia (no API key needed, never CORS issues) ───
    try {
      let query = trimmedQ.replace(/^(what is|what's|who is|who's|explain|tell me about|show me|how does|what does|diagram of|picture of|image of|can you show( me)?( a)?( picture| image)?( of)?)\s+/i, '')
        .replace(/^(a|an|the)\s+/i, '')
        .replace(/\?$/, '')
        .trim();
      let rawTitle = query.charAt(0).toUpperCase() + query.slice(1);
      
      const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url&format=json&origin=*`;
      const searchResponse = await fetch(commonsUrl, { signal: abortController.signal });
      if (!searchResponse.ok) return null;
      
      const searchData = await searchResponse.json();
      if (searchData && searchData.query && searchData.query.pages) {
        const pages = Object.values(searchData.query.pages) as any[];
        if (pages.length > 0) {
          // Get the first valid image URL
          for (const page of pages) {
            if (page.imageinfo && page.imageinfo.length > 0) {
              const imgUrl = page.imageinfo[0].url;
              
              preloadImages([imgUrl]);

              const result: Partial<VisualContext> = {
                title: rawTitle,
                explanation: '', 
                imageUrl: imgUrl,
                thumbnailUrl: imgUrl,
                searchQuery: query,
                imageSource: 'fallback',
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
        }
      }
    } catch (wikiErr: any) {
      if (wikiErr.name === 'AbortError') return null;
      console.error("Wikimedia Commons fallback failed:", wikiErr);
    }
    
    return null;
  }
};
