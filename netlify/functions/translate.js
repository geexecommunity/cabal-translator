// Netlify serverless function: proxies translation requests to Google Gemini.
// The Gemini API key lives only in the Netlify environment variable GEMINI_API_KEY
// (set it in Site settings -> Environment variables in your Netlify dashboard).
// It is never sent to the browser or included in any file in this repo.

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server not configured: missing GEMINI_API_KEY environment variable in Netlify site settings.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const model = body.model || 'gemini-3.5-flash';
  const systemPrompt = body.systemPrompt || '';
  const input = body.input || '';

  if (!input.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing input text' }) };
  }

  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: input }] }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } },
        // Default safety thresholds sometimes false-positive on ordinary MMORPG content
        // (combat/weapon/monster language in event captions, item names, etc.), especially
        // now that content is often split into small standalone chunks/paragraphs that lose
        // surrounding context. BLOCK_ONLY_HIGH still blocks genuinely severe content but
        // avoids over-flagging normal game text.
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
        ]
      }),
      signal: AbortSignal.timeout(25000)
    });

    const data = await resp.json();

    return {
      statusCode: resp.status,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    return {
      statusCode: isTimeout ? 504 : 500,
      body: JSON.stringify({ error: isTimeout ? 'Gemini took too long to respond (>25s). Try shortening the input or splitting it into smaller parts.' : (err.message || 'Unknown server error') })
    };
  }
};
