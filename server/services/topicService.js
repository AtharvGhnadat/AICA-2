export function checkRelevance(currentTopic, newUserText) {
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

  // 3. Unrelated actions/questions (Tell me a joke, What is your name, Move forward, etc)
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

  // 4. Topic change pattern (e.g. "what is X", "explain Y", "show me Z")
  // If they are asking for a NEW visual/topic, we should return related: false so the frontend can trigger a NEW image search
  // Actually, wait, if they ask a NEW topic, we want the visual panel to update, not just close.
  // The logic in frontend should be: if new topic -> call /api/image-search.
  // But this endpoint just says if it's related to the CURRENT topic.
  // Let's do a simple keyword overlap check.
  const currentWords = currentTopic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  
  // If the user's text contains significant words from the current topic, it's a follow-up.
  const hasOverlap = currentWords.some(word => text.includes(word));
  
  if (hasOverlap) {
    return { related: true, action: 'keep_open' };
  }

  // If no overlap and they are asking "what is", "explain", "show me"
  if (/^(what is|explain|show me|tell me about)/.test(text)) {
    // It's a new question, not related to the current one.
    return { related: false, action: 'close_visual_panel' }; 
  }

  // For generic short responses like "wow", "nice", "i see", keep it open if it was a follow-up
  if (text.length < 15) {
     return { related: true, action: 'keep_open' };
  }

  // Default to false for completely new topics
  return { related: false, action: 'close_visual_panel' };
}
