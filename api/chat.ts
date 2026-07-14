export const config = {
  runtime: 'edge', 
};

import { GoogleGenAI, Type } from '@google/genai';

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { audioData, text, settings } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || settings?.geminiApiKey;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured.' }), { status: 401 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const contents = [];
    const parts = [];
    if (text) {
      parts.push({ text });
    }
    
    if (audioData) {
      parts.push({
        inlineData: {
          data: typeof audioData === 'string' ? audioData : audioData.data,
          mimeType: 'audio/pcm;rate=16000',
        }
      });
    }

    contents.push({ role: 'user', parts });

    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-live-2.5-flash-native-audio', 
      contents,
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: settings?.voiceName || "Puck" } } },
        systemInstruction: {
          parts: [{ text: `You are ${settings?.deviceName || 'Aica'}, a world-class, friendly AI teacher assistant built by Atharv, Pruthviraj, Abhilesh (Professor. Vikramsinh Saste). You speak in a warm, friendly male voice.
CRITICAL IDENTITY & LANGUAGE:
- Your primary languages are Marathi and English. Explain complex topics using a natural mix of simple Marathi and English (Hinglish/Maringlish style) to make it feel like a real Indian teacher.
- Your name is ${settings?.deviceName || 'Aica'}.
- OUTPUT RULES: You MUST ONLY output the exact words you are going to speak out loud. DO NOT generate any text representing your internal thoughts.
CORE BEHAVIORS:
1. EXTREME SPEED & BREVITY: NEVER use conversational filler words. Respond instantly with maximum 1-2 punchy sentences. Speak rapidly.
2. VISUAL INTENT DETECTION: If the user asks for a NEW topic (e.g., "Explain OSI model"), you MUST call "show_visual". 
3. IMAGE EXPLANATION: When "show_visual" is called, explain it in a student-friendly way.
4. BLINDNESS WORKAROUND: If the user asks about specific colors or parts of an image, NEVER say "I cannot see the image". You MUST silently call "check_visual".
5. CLOSING: To close the screen, call the "close_visual" tool.
6. SINGLE QUESTION FOCUS: ONLY respond to the final, most direct question addressed to you.` }]
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: "show_visual",
                description: "Displays a relevant image on the user's screen. Call this when explaining educational concepts.",
                parameters: {
                  type: Type.OBJECT,
                  properties: { topic: { type: Type.STRING, description: "The exact Google Images search query to find the best image." } },
                  required: ["topic"]
                }
              },
              {
                name: "close_visual",
                description: "Closes the image panel on the screen.",
                parameters: { type: Type.OBJECT, properties: {} }
              },
              {
                name: "check_visual",
                description: "Checks what image is currently displayed on the screen.",
                parameters: { type: Type.OBJECT, properties: {} }
              }
            ]
          }
        ],
      }
    });

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            if (chunk.candidates && chunk.candidates[0].content.parts) {
              for (const part of chunk.candidates[0].content.parts) {
                if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
                  const audioBase64 = part.inlineData.data;
                  const dataChunk = JSON.stringify({ type: 'audio', audio: audioBase64, text: part.text || '' }) + '\n';
                  controller.enqueue(new TextEncoder().encode(dataChunk));
                } else if (part.text) {
                  const dataChunk = JSON.stringify({ type: 'text', text: part.text }) + '\n';
                  controller.enqueue(new TextEncoder().encode(dataChunk));
                } else if (part.functionCall) {
                  const dataChunk = JSON.stringify({ type: 'tool', functionCall: part.functionCall }) + '\n';
                  controller.enqueue(new TextEncoder().encode(dataChunk));
                }
              }
            }
          }
        } catch (e: any) {
          console.error("Stream error", e);
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'error', error: e.message }) + '\n'));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
