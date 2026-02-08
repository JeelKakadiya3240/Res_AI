/**
 * ElevenLabs Text-to-Speech service for natural voice output.
 * When ELEVENLABS_API_KEY is set, voice routes use this instead of Twilio/Polly.
 */

require('dotenv').config();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Rachel (default)
// eleven_turbo_v2_5 = much faster. Fallback model if turbo not on plan: eleven_multilingual_v2
const ELEVENLABS_MODEL_PRIMARY = process.env.ELEVENLABS_MODEL_ID || 'eleven_turbo_v2_5';
const ELEVENLABS_MODEL_FALLBACK = 'eleven_multilingual_v2';

// In-memory cache: token -> { buffer, createdAt }. Twilio fetches once per play.
const audioCache = new Map();
// Cache by text so repeated phrases (e.g. "Anything else?") skip API call = same quality, faster.
const textToBufferCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TEXT_CACHE_MAX = 80;

function isConfigured() {
  return !!ELEVENLABS_API_KEY && ELEVENLABS_API_KEY.length > 20;
}

/**
 * Strip SSML/XML so we send plain text to ElevenLabs (they don't use SSML the same way).
 */
function textForTts(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\[\[PAUSE_SHORT\]\]/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Call ElevenLabs TTS API and return MP3 buffer.
 * @param {string} text - Plain text to speak
 * @returns {Promise<Buffer|null>} - MP3 buffer or null on error
 */
async function generateAudio(text) {
  const cleanText = textForTts(text);
  if (!cleanText) return null;

  const start = Date.now();
  // optimize_streaming_latency: 3 = max latency optimizations (fastest)
  const baseUrl = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128&optimize_streaming_latency=3`;

  for (const modelId of [ELEVENLABS_MODEL_PRIMARY, ELEVENLABS_MODEL_FALLBACK]) {
    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: modelId,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        if (modelId === ELEVENLABS_MODEL_PRIMARY) {
          console.warn('[ElevenLabs] Primary model failed, trying fallback:', response.status, errText.slice(0, 80));
          continue;
        }
        console.error('[ElevenLabs] API error:', response.status, errText);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      console.log(`⏱️  [PERF] ElevenLabs TTS (API, ${modelId}): ${Date.now() - start}ms`);
      return buffer;
    } catch (error) {
      if (modelId === ELEVENLABS_MODEL_PRIMARY) {
        console.warn('[ElevenLabs] Request failed, trying fallback:', error.message);
        continue;
      }
      console.error('[ElevenLabs] Request failed:', error.message);
      return null;
    }
  }
  return null;
}

/**
 * Generate audio and store in cache. Returns a token to use in Play URL.
 * Repeated identical text reuses cached audio (0ms, same quality).
 * @param {string} text - Text to speak
 * @returns {Promise<string|null>} - Token for /api/voice/audio/:token or null
 */
async function generateAndStoreAudio(text) {
  const cleanText = textForTts(text);
  if (!cleanText) return null;

  const t0 = Date.now();
  let buffer = textToBufferCache.get(cleanText);
  if (buffer) {
    console.log(`⏱️  [PERF] ElevenLabs TTS (cached): ${Date.now() - t0}ms`);
  } else {
    buffer = await generateAudio(text);
    if (!buffer) return null;
    textToBufferCache.set(cleanText, buffer);
    if (textToBufferCache.size > TEXT_CACHE_MAX) {
      const firstKey = textToBufferCache.keys().next().value;
      if (firstKey !== undefined) textToBufferCache.delete(firstKey);
    }
  }

  const token = require('crypto').randomBytes(16).toString('hex');
  audioCache.set(token, { buffer, createdAt: Date.now() });

  if (audioCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of audioCache.entries()) {
      if (now - v.createdAt > CACHE_TTL_MS) audioCache.delete(k);
    }
  }

  return token;
}

/**
 * Get cached audio buffer by token. Returns null if missing or expired.
 * @param {string} token
 * @returns {Buffer|null}
 */
function getAudioBuffer(token) {
  const entry = audioCache.get(token);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    audioCache.delete(token);
    return null;
  }
  return entry.buffer;
}

/**
 * Pre-generate and cache audio for fixed phrases (greeting, menu response, etc.).
 * So the first time we say them we use cache = 0ms instead of calling the API.
 * Call at startup when ElevenLabs is configured.
 * @param {string[]} texts - Array of exact phrases to pre-generate
 * @returns {Promise<number>} - Count of phrases successfully cached
 */
async function prewarmCache(texts) {
  if (!isConfigured()) return 0;
  let done = 0;
  for (const text of texts) {
    const cleanText = textForTts(text);
    if (!cleanText || textToBufferCache.has(cleanText)) continue;
    const buffer = await generateAudio(text);
    if (buffer) {
      textToBufferCache.set(cleanText, buffer);
      done++;
    }
  }
  return done;
}

module.exports = {
  isConfigured,
  generateAudio,
  generateAndStoreAudio,
  getAudioBuffer,
  prewarmCache,
};
