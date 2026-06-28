import { VisualContext } from '../types/visualContext';
import { Capacitor } from '@capacitor/core';

// For Capacitor Android, we need the absolute backend IP. 
// For web browser, we use an empty string to use Vite's proxy (bypassing CSP/Mixed Content).
const API_BASE = Capacitor.isNativePlatform() 
  ? (import.meta.env.VITE_BACKEND_URL || 'http://192.168.0.226:5000') 
  : '';

// Simple cache for memory optimization on low RAM devices
const searchCache = new Map<string, Partial<VisualContext>>();

export const visualContextService = {
  async searchImage(question: string): Promise<Partial<VisualContext> | null> {
    const trimmedQ = question.trim();
    if (!trimmedQ) return null;

    if (searchCache.has(trimmedQ)) {
      return searchCache.get(trimmedQ) || null;
    }

    try {
      const response = await fetch(`${API_BASE}/api/image-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: trimmedQ }),
      });

      const data = await response.json();
      
      if (data.success) {
        const result = {
          title: data.title,
          explanation: data.explanation,
          imageUrl: data.imageUrl,
          thumbnailUrl: data.thumbnailUrl,
          searchQuery: data.searchQuery,
          imageSource: data.imageSource,
          active: true
        } as Partial<VisualContext>;

        // Keep cache small (last 10 items)
        if (searchCache.size >= 10) {
          const firstKey = searchCache.keys().next().value;
          if (firstKey) searchCache.delete(firstKey);
        }
        
        searchCache.set(trimmedQ, result);
        return result;
      }
      return null;
    } catch (error) {
      console.error('Failed to search image:', error);
      return null;
    }
  }
};
