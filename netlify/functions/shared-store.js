// Netlify serverless function: shared team-wide translation cache + glossary, backed by
// Netlify Blobs. This is what lets everyone on the team benefit from translations anyone
// else has already done, instead of each person's browser only remembering its own history.
//
// Actions (all POST, JSON body):
//   { action: 'cacheLookup', keys: [...] }              -> { results: { key: output|null, ... } }
//   { action: 'cacheStore',  entries: [{key, output}] }  -> { ok: true, count }
//   { action: 'glossaryGet' }                            -> { csv: "..." }
//   { action: 'glossarySet', csv: "..." }                -> { ok: true }

const { getStore } = require('@netlify/blobs');

const MAX_LOOKUP_KEYS = 500;
const MAX_STORE_ENTRIES = 200;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const action = body.action;

  try {
    if (action === 'cacheLookup') {
      const store = getStore('translations');
      const keys = Array.isArray(body.keys) ? body.keys.filter(k => typeof k === 'string' && k).slice(0, MAX_LOOKUP_KEYS) : [];
      const results = {};
      await Promise.all(keys.map(async (k) => {
        try {
          const val = await store.get(k, { type: 'text' });
          results[k] = val === null || val === undefined ? null : val;
        } catch (e) {
          results[k] = null;
        }
      }));
      return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ results }) };
    }

    if (action === 'cacheStore') {
      const store = getStore('translations');
      const entries = Array.isArray(body.entries)
        ? body.entries.filter(e => e && typeof e.key === 'string' && e.key && typeof e.output === 'string').slice(0, MAX_STORE_ENTRIES)
        : [];
      await Promise.all(entries.map(e => store.set(e.key, e.output)));
      return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, count: entries.length }) };
    }

    if (action === 'glossaryGet') {
      const store = getStore('glossary');
      const csv = await store.get('main', { type: 'text' });
      return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csv: csv || '' }) };
    }

    if (action === 'glossarySet') {
      const store = getStore('glossary');
      const csv = typeof body.csv === 'string' ? body.csv : '';
      await store.set('main', csv);
      return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action: ' + action }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Shared store error' }) };
  }
};
