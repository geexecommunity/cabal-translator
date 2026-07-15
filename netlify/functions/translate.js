exports.handler = async function (event) {
if (event.httpMethod !== 'POST') { return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }; }
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured: missing GEMINI_API_KEY environment variable in Netlify site settings.' }) }; }
let body;
try { body = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }
const model = body.model || 'gemini-3.5-flash';
const systemPrompt = body.systemPrompt || '';
const input = body.input || '';
if (!input.trim()) { return { statusCode: 400, body: JSON.stringify({ error: 'Missing input text' }) }; }
try {
const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
const resp = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: input }] }], generationConfig: { maxOutputTokens: 8192, temperature: 0.3 } }) });
const data = await resp.json();
return { statusCode: resp.status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) };
} catch (err) {
return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Unknown server error' }) };
}
};
