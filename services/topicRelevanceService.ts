export const topicRelevanceService = {
  async checkRelevance(currentTopic: string, newUserText: string): Promise<{ related: boolean, action: string }> {
    if (!currentTopic || !newUserText) {
      return { related: false, action: 'close_visual_panel' };
    }

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/topic-relevance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentTopic, newUserText })
      });

      if (!response.ok) {
        return { related: false, action: 'close_visual_panel' };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      // Fail safely by assuming it's unrelated and closing the visual
      return { related: false, action: 'close_visual_panel' };
    }
  }
};
