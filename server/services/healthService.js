export function checkHealth() {
  return {
    status: 'ok',
    serpapiConfigured: !!process.env.SERPAPI_API_KEY,
    geminiConfigured: !!process.env.GEMINI_API_KEY || !!process.env.API_KEY,
    timestamp: new Date().toISOString()
  };
}
