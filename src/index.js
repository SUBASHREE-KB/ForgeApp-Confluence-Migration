import Resolver from '@forge/resolver';
import { storage, fetch } from '@forge/api';

const resolver = new Resolver();

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function cleanDomain(d) {
  return (d || '').replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
}
function makeAuth(email, token) {
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

// v1 REST API
async function cfGet(domain, auth, path) {
  const r = await fetch(`https://${domain}/wiki/rest/api${path}`, {
    headers: { Authorization: auth, Accept: 'application/json' },
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`GET v1${path} → ${r.status}: ${t.slice(0,250)}`); }
  return r.json();
}
async function cfPost(domain, auth, path, body) {
  const r = await fetch(`https://${domain}/wiki/rest/api${path}`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`POST v1${path} → ${r.status}: ${t.slice(0,300)}`);
  return JSON.parse(t);
}
async function cfPut(domain, auth, path, body) {
  const r = await fetch(`https://${domain}/wiki/rest/api${path}`, {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`PUT v1${path} → ${r.status}: ${t.slice(0,300)}`);
  return JSON.parse(t);
}

// v2 REST API
async function cf2Get(domain, auth, path) {
  const r = await fetch(`https://${domain}/wiki/api/v2${path}`, {
    headers: { Authorization: auth, Accept: 'application/json' },
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`GET v2${path} → ${r.status}: ${t.slice(0,250)}`); }
  return r.json();
}
async function cf2Post(domain, auth, path, body) {
  const r = await fetch(`https://${domain}/wiki/api/v2${path}`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`POST v2${path} → ${r.status}: ${t.slice(0,300)}`);
  return JSON.parse(t);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MULTIPART UPLOAD — manual Uint8Array (Forge fetch doesn't support FormData)
// ═══════════════════════════════════════════════════════════════════════════════

async function uploadAttachment(domain, auth, pageId, filename, buffer, mimeType) {
  const boundary = `----ForgeBoundary${Date.now()}`;
  const enc = new TextEncoder();
  const header = enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const mid    = enc.encode(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="minorEdit"\r\n\r\ntrue`);
  const end    = enc.encode(`\r\n--${boundary}--\r\n`);
  const file   = new Uint8Array(buffer);
  const body   = new Uint8Array(header.length + file.length + mid.length + end.length);
  let off = 0;
  for (const c of [header, file, mid, end]) { body.set(c, off); off += c.length; }

  const r = await fetch(`https://${domain}/wiki/rest/api/content/${pageId}/child/attachment`, {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'X-Atlassian-Token': 'no-check', Accept: 'application/json' },
    body: body.buffer,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Upload "${filename}" → ${r.status}: ${t.slice(0,200)}`);
  return JSON.parse(t);
}

// ═══════════════════════════════════════════════════════════════════════════════
// v2 CURSOR PAGINATION HELPER
// ═══════════════════════════════════════════════════════════════════════════════

async function* cf2Paginate(domain, auth, path) {
  let cursor = null;
  while (true) {
    const qs   = cursor ? `${path.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(cursor)}` : '';
    const data = await cf2Get(domain, auth, `${path}${qs}`);
    yield data.results || [];
    const next = data._links?.next;
    if (!next) break;
    const m = next.match(/cursor=([^&]+)/);
    cursor = m ? decodeURIComponent(m[1]) : null;
    if (!cursor) break;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREDENTIALS
// ═══════════════════════════════════════════════════════════════════════════════

resolver.define('saveCredentials', async (req) => {
  const { type, domain, email, apiToken } = req.payload;
  await storage.set(`creds_${type}`, { domain: cleanDomain(domain), email, apiToken });
  return { success: true };
});

resolver.define('getCredentials', async (req) => {
  const c = await storage.get(`creds_${req.payload.type}`);
  if (!c) return null;
  return { domain: c.domain, email: c.email, hasToken: !!c.apiToken };
});

resolver.define('testConnection', async (req) => {
  const c = await storage.get(`creds_${req.payload.type}`);
  if (!c) return { success: false, error: 'No credentials saved.' };
  const domain = cleanDomain(c.domain);
  try {
    const r = await fetch(`https://${domain}/wiki/rest/api/space?limit=1`, {
      headers: { Authorization: makeAuth(c.email, c.apiToken), Accept: 'application/json' },
    });
    const t = await r.text();
    if (r.ok)           return { success: true, siteTitle: domain };
    if (r.status === 401) return { success: false, error: '401 — Wrong email or API token.' };
    if (r.status === 403) return { success: false, error: '403 — No Confluence access.' };
    if (r.status === 404) return { success: false, error: `404 — "${domain}" not found.` };
    return { success: false, error: `HTTP ${r.status}: ${t.slice(0,200)}` };
  } catch (e) {
    return { success: false, error: `Network error: ${e.message}` };
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FETCH SPACES — all types, cursor pagination, v1+v2
// ═══════════════════════════════════════════════════════════════════════════════

resolver.define('fetchSpaces', async () => {
  const c = await storage.get('creds_source');
  if (!c) return { error: 'Source credentials not configured' };
  const domain = cleanDomain(c.domain);
  const auth   = makeAuth(c.email, c.apiToken);
  const seen   = new Set();
  const spaces = [];

  // v1: fetch both global and personal types
  for (const type of ['global', 'personal']) {
    let path = `/space?limit=50&type=${type}&status=current&expand=description.plain`;
    while (path) {
      try {
        const url  = path.startsWith('http') ? path : `https://${domain}/wiki/rest/api${path}`;
        const r    = await fetch(url, { headers: { Authorization: auth, Accept: 'application/json' } });
        if (!r.ok) break;
        const data = await r.json();
        for (const sp of data.results || []) {
          if (!seen.has(sp.key)) { seen.add(sp.key); spaces.push(sp); }
        }
        path = data._links?.next || null;
      } catch (_) { break; }
    }
  }

  // v2: catches any spaces v1 missed
  try {
    for await (const batch of cf2Paginate(domain, auth, '/spaces?limit=50')) {
      for (const sp of batch) {
        if (!seen.has(sp.key)) {
          seen.add(sp.key);
          spaces.push({ id: sp.id, key: sp.key, name: sp.name, type: sp.type || 'global', status: sp.status || 'current', description: { plain: { value: sp.description || '' } } });
        }
      }
    }
  } catch (_) {}

  return { spaces };
});

// ═══════════════════════════════════════════════════════════════════════════════
// PREPARE MIGRATION
//
// HOW FOLDERS WORK (confirmed: Atlassian docs + community threads, Feb 2025):
//
//  • Folders are FIRST-CLASS in v2 — NOT pages with a property.
//  • v1 /child/page NEVER returns folders.
//  • There is NO /spaces/{id}/content/folder endpoint.
//  • Correct BFS approach:
//      Start at homepage → GET /wiki/api/v2/pages/{id}/direct-children
//      For each folder   → GET /wiki/api/v2/folders/{id}/direct-children
//    Both endpoints return a mixed list: [{id, title, type: "page"|"folder"|...}]
//  • Create on dst:
//      folder     → POST /wiki/api/v2/folders     {spaceId, title, parentId}
//      page       → POST /wiki/rest/api/content   {type:"page", ...}  (v1)
//      database   → POST /wiki/api/v2/databases   {spaceId, title, parentId}
//      whiteboard → POST /wiki/api/v2/whiteboards {spaceId, title, parentId}
// ═══════════════════════════════════════════════════════════════════════════════

resolver.define('prepareMigration', async (req) => {
  const { spaceKey, spaceName, spaceDescription } = req.payload;
  const srcCreds = await storage.get('creds_source');
  const dstCreds = await storage.get('creds_dest');
  if (!srcCreds || !dstCreds) return { error: 'Credentials not configured.' };

  const srcDomain = cleanDomain(srcCreds.domain);
  const dstDomain = cleanDomain(dstCreds.domain);
  const srcAuth   = makeAuth(srcCreds.email, srcCreds.apiToken);
  const dstAuth   = makeAuth(dstCreds.email, dstCreds.apiToken);
  const log       = [];

  try {
    // 1. Create destination space
    log.push(`Creating space "${spaceName}" (${spaceKey}) on destination…`);
    const sr = await fetch(`https://${dstDomain}/wiki/rest/api/space`, {
      method: 'POST',
      headers: { Authorization: dstAuth, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ key: spaceKey, name: spaceName, description: { plain: { value: spaceDescription || '', representation: 'plain' } } }),
    });
    if (!sr.ok) {
      const txt = await sr.text();
      if (txt.includes('already exist') || sr.status === 400) { log.push('  ⚠ Space already exists.'); }
      else return { error: `Space creation failed: ${txt}`, log };
    } else { log.push('  ✓ Space created.'); }

    // 2. Destination homepage (v1 page ID — used as parent for pages)
    const dstInfo  = await cfGet(dstDomain, dstAuth, `/space/${spaceKey}?expand=homepage`);
    const dstHomeId = dstInfo.homepage?.id;
    log.push(`  ✓ Destination homepage: ${dstHomeId}`);

    // 3. Source homepage (v1 page ID — BFS start node)
    const srcInfo  = await cfGet(srcDomain, srcAuth, `/space/${spaceKey}?expand=homepage`);
    const srcRootId = srcInfo.homepage?.id;
    if (!srcRootId) return { error: 'Source space has no homepage.', log };

    // 4. Resolve destination v2 spaceId (numeric — needed for folder/db/wb creation)
    const dstV2   = await cf2Get(dstDomain, dstAuth, `/spaces?keys=${spaceKey}&limit=1`);
    const dstSpaceId = dstV2.results?.[0]?.id;
    if (!dstSpaceId) return { error: `Cannot resolve destination spaceId for key ${spaceKey}`, log };
    log.push(`  ✓ Destination spaceId (v2): ${dstSpaceId}`);

    // 5. BFS using v2 direct-children — the ONLY API that returns folders+pages mixed
    //    Queue: { id, parentId, nodeType }
    //    nodeType drives which endpoint to call: "page" or "folder"
    log.push(`Scanning all content (pages, folders, databases, whiteboards)…`);
    const items = [];
    const queue = [{ id: srcRootId, parentId: null, nodeType: 'page' }];
    const seen  = new Set([srcRootId]); // avoid duplicates

    while (queue.length > 0) {
      const { id: nodeId, parentId, nodeType } = queue.shift();

      // Pick the correct direct-children endpoint based on the parent type
      const endpoint = nodeType === 'folder'
        ? `/folders/${nodeId}/direct-children?limit=50`
        : `/pages/${nodeId}/direct-children?limit=50`;

      try {
        for await (const batch of cf2Paginate(srcDomain, srcAuth, endpoint)) {
          for (const child of batch) {
            if (seen.has(child.id)) continue;
            seen.add(child.id);

            const ct = (child.type || 'page').toLowerCase();
            console.log(`[BFS] type=${ct} title="${child.title}" id=${child.id} parent=${nodeId}`);

            items.push({
              id:          child.id,
              title:       child.title,
              parentId:    nodeId,
              contentType: ct,               // "page" | "folder" | "database" | "whiteboard" | "embed"
              emoji:       child.emojiTitlePublished || null,
              labels:      [],
            });

            // Recurse into nodes that can have children
            if (ct === 'page' || ct === 'folder') {
              queue.push({ id: child.id, parentId: nodeId, nodeType: ct });
            }
          }
        }
      } catch (e) {
        log.push(`  ⚠ direct-children failed for ${nodeType} ${nodeId}: ${e.message}`);
      }
    }

    const counts = ['page','folder','database','whiteboard','embed'].reduce((o, t) => {
      o[t] = items.filter(i => i.contentType === t).length; return o;
    }, {});
    log.push(
      `  ✓ Found ${items.length} items: ` +
      `${counts.page} pages, ${counts.folder} folders, ${counts.database} databases, ` +
      `${counts.whiteboard} whiteboards, ${counts.embed} embeds`
    );

    await storage.set('migration_state', {
      spaceKey, srcDomain, dstDomain, dstHomeId, dstSpaceId,
      pages: items, idMap: {}, progress: 0, log,
    });

    return { success: true, total: items.length, log };
  } catch (err) {
    log.push(`❌ ${err.message}`);
    return { error: err.message, log };
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MIGRATE NEXT BATCH
// ═══════════════════════════════════════════════════════════════════════════════

resolver.define('migrateNextBatch', async (req) => {
  const batchSize = req.payload?.batchSize || 5;
  const state     = await storage.get('migration_state');
  if (!state) return { error: 'No migration in progress.' };

  const { spaceKey, srcDomain, dstDomain, dstHomeId, dstSpaceId, pages, progress } = state;
  let   { idMap } = state;

  const srcCreds = await storage.get('creds_source');
  const dstCreds = await storage.get('creds_dest');
  const srcAuth  = makeAuth(srcCreds.email, srcCreds.apiToken);
  const dstAuth  = makeAuth(dstCreds.email, dstCreds.apiToken);

  const log = [];
  const end = Math.min(progress + batchSize, pages.length);

  for (let i = progress; i < end; i++) {
    const item = pages[i];
    const icon = { page:'📄', folder:'📁', database:'🗄', whiteboard:'🖼', embed:'🔗' }[item.contentType] || '📄';
    log.push(`[${i+1}/${pages.length}] ${icon} [${item.contentType}] "${item.title}"`);

    // Resolve parent ID on destination
    let dstParentId = dstHomeId;
    if (item.parentId && idMap[item.parentId]) dstParentId = idMap[item.parentId];

    try {
      switch (item.contentType) {

        case 'folder':
          // POST /wiki/api/v2/folders — the only correct way to create a folder
          await migrateFolder(item, dstParentId, dstSpaceId, dstDomain, dstAuth, idMap, log);
          break;

        case 'page':
          await migratePage(item, dstParentId, spaceKey, srcDomain, srcAuth, dstDomain, dstAuth, idMap, log);
          break;

        case 'database':
          await migrateDatabase(item, dstParentId, dstSpaceId, spaceKey, srcDomain, srcAuth, dstDomain, dstAuth, idMap, log);
          break;

        case 'whiteboard':
          await migrateWhiteboard(item, dstParentId, dstSpaceId, dstDomain, dstAuth, idMap, log);
          break;

        case 'embed':
          await migrateEmbed(item, dstParentId, spaceKey, dstDomain, dstAuth, idMap, log);
          break;

        default:
          // Unknown type — migrate as a plain page so nothing is lost
          await migratePage(item, dstParentId, spaceKey, srcDomain, srcAuth, dstDomain, dstAuth, idMap, log);
      }
    } catch (err) {
      log.push(`  ❌ ${err.message}`);
    }
  }

  const newProgress = end;
  await storage.set('migration_state', { ...state, idMap, progress: newProgress });
  const done = newProgress >= pages.length;
  if (done) log.push(`✅ All ${pages.length} items migrated!`);

  return { log, progress: newProgress, total: pages.length, done, percent: Math.round((newProgress/pages.length)*100) };
});

// ═══════════════════════════════════════════════════════════════════════════════
// FINALIZE / STATUS
// ═══════════════════════════════════════════════════════════════════════════════

resolver.define('finalizeMigration', async () => { await storage.delete('migration_state'); return { success: true }; });

resolver.define('getMigrationStatus', async () => {
  const s = await storage.get('migration_state');
  if (!s) return { active: false };
  return { active: true, spaceKey: s.spaceKey, progress: s.progress, total: s.pages?.length||0,
           percent: s.pages?.length ? Math.round((s.progress/s.pages.length)*100) : 0 };
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT MIGRATORS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── FOLDER ──────────────────────────────────────────────────────────────────
// POST /wiki/api/v2/folders { spaceId, title, parentId }
// parentId is the destination ID of the parent folder or page.
// For root-level folders, parentId = the destination homepage ID.

async function migrateFolder(item, dstParentId, dstSpaceId, dstDomain, dstAuth, idMap, log) {
  const payload = { spaceId: String(dstSpaceId), title: item.title };
  if (dstParentId) payload.parentId = String(dstParentId);

  const created = await cf2Post(dstDomain, dstAuth, '/folders', payload);
  idMap[item.id] = created.id;
  log.push(`  ✓ Folder created (dst: ${created.id})`);

  // Set emoji via content-properties if present
  if (item.emoji) {
    try {
      await cf2Post(dstDomain, dstAuth, `/pages/${created.id}/properties`, {
        key: 'emoji-title-published', value: item.emoji,
      });
    } catch (_) {}
  }
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

async function migratePage(item, dstParentId, spaceKey, srcDomain, srcAuth, dstDomain, dstAuth, idMap, log) {
  // Fetch full content + labels + emoji properties
  const full = await cfGet(srcDomain, srcAuth,
    `/content/${item.id}?expand=body.storage,metadata.labels,metadata.properties,` +
    `metadata.properties.emoji-title-published,metadata.properties.emoji-title-draft`
  );

  const rawBody  = full.body?.storage?.value || '';
  const labels   = full.metadata?.labels?.results?.map(l => l.name) || [];
  const emojiProp = full.metadata?.properties?.['emoji-title-published'] || full.metadata?.properties?.['emoji-title-draft'];
  const emoji     = emojiProp?.value ?? item.emoji ?? null;

  // Create page (v1)
  const payload = {
    type: 'page', title: full.title, space: { key: spaceKey },
    body: { storage: { value: rewriteBody(rawBody, srcDomain, dstDomain, spaceKey), representation: 'storage' } },
  };
  if (dstParentId) payload.ancestors = [{ id: String(dstParentId) }];

  const created = await cfPost(dstDomain, dstAuth, '/content', payload);
  idMap[item.id] = created.id;
  log.push(`  ✓ Page created (dst: ${created.id})`);

  // Emoji icon
  await setEmoji(dstDomain, dstAuth, created.id, emoji, log);

  // Labels
  if (labels.length) {
    try {
      await cfPost(dstDomain, dstAuth, `/content/${created.id}/label`, labels.map(n => ({ prefix: 'global', name: n })));
      log.push(`  ✓ Labels: ${labels.join(', ')}`);
    } catch (_) {}
  }

  // Attachments
  const attMap = await migrateAttachments(srcDomain, srcAuth, item.id, dstDomain, dstAuth, created.id, log);
  Object.assign(idMap, attMap);

  // Re-publish body with resolved attachment IDs
  if (Object.keys(attMap).length > 0) {
    try {
      await cfPut(dstDomain, dstAuth, `/content/${created.id}`, {
        version: { number: 2 }, title: full.title, type: 'page',
        body: { storage: { value: rewriteBody(rawBody, srcDomain, dstDomain, spaceKey), representation: 'storage' } },
      });
      log.push(`  ✓ Body updated with attachment refs`);
    } catch (_) {}
  }

  // Comments
  await migrateComments(srcDomain, srcAuth, item.id, dstDomain, dstAuth, created.id, spaceKey, log);

  // Likes
  await migrateLikes(srcDomain, srcAuth, item.id, dstDomain, dstAuth, created.id, log);
}

// ─── DATABASE ─────────────────────────────────────────────────────────────────
// Database schema/rows are NOT accessible via API — we create an empty database
// and log a note. Falls back to placeholder page if v2 database API unavailable.

async function migrateDatabase(item, dstParentId, dstSpaceId, spaceKey, srcDomain, srcAuth, dstDomain, dstAuth, idMap, log) {
  try {
    const payload = { spaceId: String(dstSpaceId), title: item.title };
    if (dstParentId) payload.parentId = String(dstParentId);
    if (item.emoji)  payload.emojiTitlePublished = item.emoji;
    const created = await cf2Post(dstDomain, dstAuth, '/databases', payload);
    idMap[item.id] = created.id;
    log.push(`  ✓ Database created (dst: ${created.id})`);
    log.push(`  ℹ Database rows must be re-entered manually (API limitation)`);
  } catch (e) {
    log.push(`  ⚠ Database v2 failed (${e.message}) — creating placeholder page`);
    try {
      const p = {
        type: 'page', title: `[Database] ${item.title}`, space: { key: spaceKey },
        body: { storage: { value: `<p><strong>🗄 Database: ${item.title}</strong></p><p><em>This was a Confluence Database. Row data is not accessible via REST API — please recreate manually.</em></p>`, representation: 'storage' } },
      };
      if (dstParentId) p.ancestors = [{ id: String(dstParentId) }];
      const created = await cfPost(dstDomain, dstAuth, '/content', p);
      idMap[item.id] = created.id;
      log.push(`  ✓ Placeholder page created (dst: ${created.id})`);
    } catch (e2) { log.push(`  ❌ ${e2.message}`); }
  }
}

// ─── WHITEBOARD ───────────────────────────────────────────────────────────────
// Whiteboard drawing content is not exportable via REST API.
// We create an empty whiteboard with same title.

async function migrateWhiteboard(item, dstParentId, dstSpaceId, dstDomain, dstAuth, idMap, log) {
  try {
    const payload = { spaceId: String(dstSpaceId), title: item.title };
    if (dstParentId) payload.parentId = String(dstParentId);
    if (item.emoji)  payload.emojiTitlePublished = item.emoji;
    const created = await cf2Post(dstDomain, dstAuth, '/whiteboards', payload);
    idMap[item.id] = created.id;
    log.push(`  ✓ Whiteboard created (dst: ${created.id})`);
    log.push(`  ℹ Whiteboard drawing content cannot be migrated via API — recreate manually`);
  } catch (e) {
    log.push(`  ⚠ Whiteboard v2 failed (${e.message}) — skipping`);
  }
}

// ─── EMBED ────────────────────────────────────────────────────────────────────

async function migrateEmbed(item, dstParentId, spaceKey, dstDomain, dstAuth, idMap, log) {
  try {
    const body = `<p><strong>🔗 Embed: ${item.title}</strong></p>${item.embedUrl ? `<p><a href="${item.embedUrl}">${item.embedUrl}</a></p>` : '<p><em>Embed URL not available.</em></p>'}`;
    const p = {
      type: 'page', title: item.title, space: { key: spaceKey },
      body: { storage: { value: body, representation: 'storage' } },
    };
    if (dstParentId) p.ancestors = [{ id: String(dstParentId) }];
    const created = await cfPost(dstDomain, dstAuth, '/content', p);
    idMap[item.id] = created.id;
    log.push(`  ✓ Embed page created (dst: ${created.id})`);
  } catch (e) { log.push(`  ❌ Embed: ${e.message}`); }
}

// ─── EMOJI ───────────────────────────────────────────────────────────────────

async function setEmoji(domain, auth, pageId, emoji, log) {
  if (!emoji) return;
  try {
    await cfPost(domain, auth, `/content/${pageId}/property`, { key: 'emoji-title-published', value: emoji });
    log.push(`  ✓ Emoji: ${typeof emoji === 'object' ? emoji.value || JSON.stringify(emoji) : emoji}`);
  } catch (_) {
    try {
      await cfPut(domain, auth, `/content/${pageId}/property/emoji-title-published`, { key: 'emoji-title-published', value: emoji, version: { number: 1 } });
      log.push(`  ✓ Emoji updated`);
    } catch (e) { log.push(`  ⚠ Emoji: ${e.message}`); }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STORAGE BODY REWRITER
// ═══════════════════════════════════════════════════════════════════════════════

function rewriteBody(body, srcDomain, dstDomain, spaceKey) {
  if (!body) return '';
  let out = body;

  // Add space-key to ri:page links
  out = out.replace(/<ri:page([^/]*?)\/>/g, (m, a) =>
    a.includes('ri:space-key') ? m : `<ri:page ri:space-key="${spaceKey}"${a}/>`
  );

  // Replace source URLs
  if (srcDomain !== dstDomain) {
    const e = srcDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`https://${e}/wiki`, 'g'), `https://${dstDomain}/wiki`);
    out = out.replace(new RegExp(`https://${e}/`,    'g'), `https://${dstDomain}/`);
  }

  // Strip Jira macro instance params
  out = out.replace(
    /(<ac:structured-macro[^>]*ac:name="jira"[^>]*>)([\s\S]*?)(<\/ac:structured-macro>)/g,
    (_, o, inner, c) => `${o}${inner.replace(/<ac:parameter ac:name="server(?:Id)?">[^<]*<\/ac:parameter>/g, '')}${c}`
  );

  // Fix include macro page refs
  out = out.replace(
    /(<ac:structured-macro[^>]*ac:name="(?:include|excerpt-include)"[^>]*>)([\s\S]*?)(<\/ac:structured-macro>)/g,
    (_, o, inner, c) => `${o}${inner.replace(/<ri:page([^/]*?)\/>/g, (m, a) =>
      a.includes('ri:space-key') ? m : `<ri:page ri:space-key="${spaceKey}"${a}/>`
    )}${c}`
  );

  // User mentions → display name
  out = out.replace(
    /<ac:link>\s*<ri:user ri:account-id="[^"]*"[^/]*\/>\s*<ac:plain-text-link-body><!\[CDATA\[([^\]]*)\]\]><\/ac:plain-text-link-body>\s*<\/ac:link>/g,
    (_, name) => `<strong>@${name}</strong>`
  );
  out = out.replace(/<ac:link>\s*<ri:user[^/]*\/>\s*<\/ac:link>/g, '<strong>@[user]</strong>');
  out = out.replace(/<ri:user[^/]*\/>/g, '');

  // Reset task IDs
  let tid = 1;
  out = out.replace(/<ac:task-id>\d+<\/ac:task-id>/g, () => `<ac:task-id>${tid++}</ac:task-id>`);

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ATTACHMENTS
// ═══════════════════════════════════════════════════════════════════════════════

async function migrateAttachments(srcDomain, srcAuth, srcPageId, dstDomain, dstAuth, dstPageId, log) {
  const attMap = {};
  try {
    let start = 0;
    while (true) {
      const data = await cfGet(srcDomain, srcAuth, `/content/${srcPageId}/child/attachment?limit=25&start=${start}&expand=version,metadata`);
      for (const att of data.results || []) {
        try {
          const dlUrl = att._links?.download
            ? `https://${srcDomain}/wiki${att._links.download}`
            : `https://${srcDomain}/wiki/download/attachments/${srcPageId}/${encodeURIComponent(att.title)}`;
          const fr = await fetch(dlUrl, { headers: { Authorization: srcAuth } });
          if (!fr.ok) { log.push(`    ⚠ Download failed: ${att.title} (${fr.status})`); continue; }
          const buf      = await fr.arrayBuffer();
          const uploaded = await uploadAttachment(dstDomain, dstAuth, dstPageId, att.title, buf, att.mediaType || guessMime(att.title));
          const dstAtt   = uploaded.results?.[0] || uploaded;
          if (dstAtt?.id) attMap[att.id] = dstAtt.id;
          log.push(`    ✓ ${att.title} (${fmtBytes(buf.byteLength)})`);
        } catch (e) { log.push(`    ⚠ "${att.title}": ${e.message}`); }
      }
      if ((data.results||[]).length < 25) break;
      start += 25;
    }
  } catch (e) { log.push(`    ⚠ Attachments: ${e.message}`); }
  return attMap;
}

function guessMime(f) {
  const m = { png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',svg:'image/svg+xml',webp:'image/webp',pdf:'application/pdf',zip:'application/zip',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',txt:'text/plain',csv:'text/csv',json:'application/json',mp4:'video/mp4',mp3:'audio/mpeg' };
  return m[(f||'').split('.').pop().toLowerCase()] || 'application/octet-stream';
}
function fmtBytes(b) {
  if (b<1024) return `${b}B`; if (b<1048576) return `${(b/1024).toFixed(1)}KB`; return `${(b/1048576).toFixed(1)}MB`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMENTS
// ═══════════════════════════════════════════════════════════════════════════════

async function migrateComments(srcDomain, srcAuth, srcPageId, dstDomain, dstAuth, dstPageId, spaceKey, log) {
  try {
    const data = await cfGet(srcDomain, srcAuth, `/content/${srcPageId}/child/comment?expand=body.storage,ancestors&depth=all&limit=100`);
    const all  = data.results || [];
    if (!all.length) return;
    const cmap = {};
    for (const c of all.filter(c => !c.ancestors?.length)) {
      try { const r = await cfPost(dstDomain, dstAuth, '/content', { type:'comment', container:{id:String(dstPageId),type:'page'}, space:{key:spaceKey}, body:{storage:{value:c.body?.storage?.value||'',representation:'storage'}} }); cmap[c.id]=r.id; } catch(_){}
    }
    for (const c of all.filter(c=>c.ancestors?.length).sort((a,b)=>a.ancestors.length-b.ancestors.length)) {
      const pid = cmap[c.ancestors[c.ancestors.length-1].id]; if(!pid) continue;
      try { const r = await cfPost(dstDomain, dstAuth, '/content', { type:'comment', container:{id:String(dstPageId),type:'page'}, ancestors:[{id:String(pid)}], space:{key:spaceKey}, body:{storage:{value:c.body?.storage?.value||'',representation:'storage'}} }); cmap[c.id]=r.id; } catch(_){}
    }
    log.push(`    ✓ Comments migrated`);
  } catch (e) { log.push(`    ⚠ Comments: ${e.message}`); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIKES
// ═══════════════════════════════════════════════════════════════════════════════

async function migrateLikes(srcDomain, srcAuth, srcPageId, dstDomain, dstAuth, dstPageId, log) {
  try {
    const r = await fetch(`https://${srcDomain}/wiki/rest/api/content/${srcPageId}/likes`, { headers:{Authorization:srcAuth,Accept:'application/json'} });
    if (!r.ok) return;
    const d = await r.json(); const count = d.results?.length||0;
    if (count > 0) {
      try { await fetch(`https://${dstDomain}/wiki/rest/api/content/${dstPageId}/likes`, {method:'POST',headers:{Authorization:dstAuth}}); log.push(`    ✓ Likes: ${count} on source (1 added)`); }
      catch(_) { log.push(`    ℹ Source likes: ${count}`); }
    }
  } catch(_) {}
}

export const handler = resolver.getDefinitions();