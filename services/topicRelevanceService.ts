export const topicRelevanceService = {
  async checkRelevance(currentTopic: string, newUserText: string): Promise<{ related: boolean, action: string }> {
    if (!currentTopic || !newUserText) {
      return { related: false, action: 'close_visual_panel' };
    }

    const text = newUserText.toLowerCase().trim();

    // 1. Direct closing commands
    const closeCommands = ['close', 'stop', 'okay thanks', 'ok thanks', 'exit', 'hide', 'dismiss', 'clear'];
    if (closeCommands.some(cmd => text.includes(cmd))) {
      return { related: false, action: 'close_visual_panel' };
    }

    // 2. Greetings and conversational filler
    const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'how are you'];
    if (greetings.includes(text)) {
      return { related: false, action: 'close_visual_panel' };
    }

    // 3. Unrelated actions/questions
    const unrelatedPatterns = [
      /^tell me a joke/i,
      /what is your name/i,
      /who made you/i,
      /move forward/i,
      /open settings/i,
      /sing a song/i,
      /what time is it/i
    ];
    if (unrelatedPatterns.some(pattern => pattern.test(text))) {
      return { related: false, action: 'close_visual_panel' };
    }

    const currentWords = currentTopic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const hasOverlap = currentWords.some(word => text.includes(word));
    
    if (hasOverlap) {
      return { related: true, action: 'keep_open' };
    }

    if (/^(what is|explain|show me|tell me about)/.test(text)) {
      return { related: false, action: 'close_visual_panel' }; 
    }

    if (text.length < 15) {
       return { related: true, action: 'keep_open' };
    }

    return { related: false, action: 'close_visual_panel' };
  }
};
