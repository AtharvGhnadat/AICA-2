const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export const topicRelevanceService = {
  async checkRelevance(currentTopic: string, newUserText: string): Promise<{ related: boolean, action: string }> {
    if (!currentTopic || !newUserText) {
      return { related: false, action: 'close_visual_panel' };
    }

    try {
      const response = await fetch(`${API_BASE}/api/topic-relevance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currentTopic, newUserText }),
      });

      const data = await response.json();
      return {
        related: data.related ?? false,
        action: data.action ?? 'close_visual_panel'
      };
    } catch (error) {
      console.error('Failed to check topic relevance:', error);
      // Fallback: assume unrelated on error to be safe and close panel
      return { related: false, action: 'close_visual_panel' };
    }
  }
};
