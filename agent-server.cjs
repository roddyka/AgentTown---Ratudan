#!/usr/bin/env node
/**
 * Agent Town standalone server.
 * Serves the 3D city (web/index.html) and local agent bridge API/SSE.
 * No JSRat GameEngine required.
 *
 *   node agent-server.cjs
 *   # open http://127.0.0.1:47110
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const PORT = Number(process.env.AGENT_TOWN_PORT || process.env.PORT || 47110);
const HOST = process.env.AGENT_TOWN_HOST || '127.0.0.1';
const PORT_FILE = path.join(os.homedir(), '.agent-office', 'port');
const LOG_MAX = 800;
const WEB_DIR = path.join(__dirname, 'web');
const state = { agents: new Map(), events: [], clients: new Set(), pending: new Map() };

function now() { return Date.now(); }
function uid() { return Math.random().toString(36).slice(2, 10); }
function emit(type, data) {
  const evt = { id: uid(), type, at: now(), data };
  state.events.push(evt);
  if (state.events.length > LOG_MAX) state.events.splice(0, state.events.length - LOG_MAX);
  const payload = `event: ${type}\ndata: ${JSON.stringify(evt)}\n\n`;
  for (const res of state.clients) try { res.write(payload); } catch {}
  return evt;
}
function upsertAgent(id, patch) {
  const prev = state.agents.get(id) || {
    id, name: id, source: 'unknown', status: 'idle', task: '', detail: '',
    lastSeen: now(), quest: null, history: [], avatar: 'heroi_cavaleiro',
  };
  const next = { ...prev, ...patch, lastSeen: patch.lastSeen || now() };
  if (patch.task && patch.task !== prev.task) {
    next.history = [{ at: now(), task: patch.task, status: patch.status || next.status }, ...(prev.history || [])].slice(0, 20);
  }
  state.agents.set(id, next);
  emit('agent', next);
  return next;
}
function completeTask(agentId, reason = 'completed') {
  const a = state.agents.get(agentId);
  if (!a) return;
  const task = a.task || a.quest?.title || 'Task';
  upsertAgent(agentId, { status: 'idle', task: '', detail: reason, quest: null });
  emit('notify', { agentId, title: `${a.name}: ${reason}`, body: task, kind: reason });
}
function readBody(req, max = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => { buf += c; if (buf.length > max) { req.destroy(); reject(new Error('too big')); } });
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}
function send(res, code, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': typeof body === 'object' && !Buffer.isBuffer(body) ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}

function normalizeClaudeEvent(e) {
  const sid = e.session_id || e.sessionId || 'claude-session';
  const aid = e.agent_id || e.agentId || sid;
  const id = `claude:${aid}`;
  const name = e.agent_name || e.agent || (aid === sid ? 'Claude' : `Claude ${String(aid).slice(0, 6)}`);
  const ev = e.hook_event_name || e.event || '';
  const tool = e.tool_name || e.tool || '';
  const base = { source: 'claude', name, avatar: 'heroi_mago', lastSeen: now(), sessionId: sid };
  if (ev === 'SessionStart' || ev === 'UserPromptSubmit') upsertAgent(id, { ...base, status: 'idle', detail: ev });
  if (ev === 'PreToolUse' || ev === 'PostToolUse' || ev === 'SubagentStart') {
    const task = e.description || e.tool_input?.description || e.tool_input?.command || tool || 'Working';
    upsertAgent(id, { ...base, status: 'working', task: String(task).slice(0, 120), detail: tool || ev, quest: state.agents.get(id)?.quest || { id: uid(), title: String(task).slice(0, 120), detail: tool, progress: 0, startedAt: now() } });
  }
  if (ev === 'PermissionRequest') {
    const task = e.tool_input?.command || e.tool_name || 'Permission needed';
    upsertAgent(id, { ...base, status: 'waiting', task: String(task).slice(0, 120), detail: 'permission', quest: state.agents.get(id)?.quest || { id: uid(), title: 'Approval', detail: String(task).slice(0, 120), progress: 0, startedAt: now() } });
    emit('notify', { agentId: id, title: `${name} needs approval`, body: String(task).slice(0, 160), kind: 'permission' });
  }
  if (ev === 'Stop' || ev === 'SessionEnd' || ev === 'SubagentStop') {
    upsertAgent(id, { ...base, detail: ev });
    completeTask(id, ev === 'SessionEnd' ? 'session ended' : 'completed');
  }
}

function pollOpenCode() {
  const db = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
  if (!fs.existsSync(db)) return;
  const script = `
import sqlite3, json, os
db = os.path.expandvars(r'${db.replace(/\\/g, '\\\\')}')
conn = sqlite3.connect(db)
conn.row_factory = sqlite3.Row
cur = conn.cursor()
out = {'sessions':[], 'jobs':[]}
try:
  cur.execute("select id,title,workspace_id,time_created,time_updated from session_v2 order by time_updated desc limit 20")
  out['sessions']=[dict(r) for r in cur.fetchall()]
except Exception as e:
  out['sessions_error']=str(e)
try:
  cur.execute("select session_id,child_session_id,kind,title,status,output,error,time_created,time_updated from job order by time_updated desc limit 40")
  out['jobs']=[dict(r) for r in cur.fetchall()]
except Exception as e:
  out['jobs_error']=str(e)
print(json.dumps(out, default=str))
`;
  const r = spawnSync('python', ['-c', script], { encoding: 'utf8', timeout: 8000 });
  if (r.status !== 0 || !r.stdout) return;
  let data; try { data = JSON.parse(r.stdout.trim()); } catch { return; }
  const activeSessions = new Set();
  for (const j of data.jobs || []) {
    const sid = j.session_id || j.child_session_id;
    if (!sid) continue;
    const id = `opencode:${sid}`;
    activeSessions.add(id);
    const status = String(j.status || '').toLowerCase();
    const working = ['running', 'pending', 'in_progress', 'queued'].includes(status);
    const failed = ['error', 'failed', 'cancelled'].includes(status);
    const done = ['completed', 'done', 'success', 'succeeded'].includes(status);
    const task = String(j.title || j.kind || 'OpenCode task').slice(0, 120);
    if (working) upsertAgent(id, { name: `OpenCode ${String(sid).slice(-6)}`, source: 'opencode', avatar: 'heroi_cavaleiro', status: 'working', task, detail: status, sessionId: sid, quest: state.agents.get(id)?.quest || { id: uid(), title: task, detail: j.kind || '', progress: 0, startedAt: now() } });
    else if (failed) { upsertAgent(id, { name: `OpenCode ${String(sid).slice(-6)}`, source: 'opencode', avatar: 'heroi_cavaleiro', status: 'error', task, detail: String(j.error || status).slice(0, 160), sessionId: sid }); emit('notify', { agentId: id, title: 'OpenCode task failed', body: task, kind: 'error' }); }
    else if (done) { upsertAgent(id, { name: `OpenCode ${String(sid).slice(-6)}`, source: 'opencode', avatar: 'heroi_cavaleiro', status: 'idle', detail: status, sessionId: sid }); if (state.agents.get(id)?.quest) completeTask(id, 'completed'); }
  }
  for (const s of data.sessions || []) {
    const id = `opencode:${s.id}`;
    if (activeSessions.has(id)) continue;
    const age = now() - Number(s.time_updated || s.time_created || 0);
    const recent = age < 10 * 60 * 1000;
    upsertAgent(id, { name: String(s.title || `OpenCode ${String(s.id).slice(-6)}`).slice(0, 40), source: 'opencode', avatar: 'heroi_cavaleiro', status: recent ? 'idle' : 'sleeping', task: '', detail: recent ? 'session recent' : 'session inactive', sessionId: s.id });
  }
}

function pollProcesses() {
  const r = spawnSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', timeout: 8000 });
  if (r.status !== 0 || !r.stdout) return;
  const known = [
    ['claude', 'Claude', 'heroi_mago'], ['opencode', 'OpenCode', 'heroi_cavaleiro'], ['cursor', 'Cursor', 'heroi_arqueiro'],
    ['codex', 'Codex', 'heroi_feiticeiro'], ['aider', 'Aider', 'npc_batedora'], ['gemini', 'Gemini', 'npc_mercadora'],
    ['copilot', 'Copilot', 'npc_guarda'], ['windsurf', 'Windsurf', 'npc_bardo'], ['cline', 'Cline', 'npc_mineiro'],
  ];
  const text = r.stdout.toLowerCase();
  for (const [needle, name, avatar] of known) {
    if (!text.includes(needle)) continue;
    const id = `proc:${needle}`;
    if (!state.agents.has(id)) upsertAgent(id, { id, name, source: 'process', avatar, status: 'idle', detail: 'detected process', task: '' });
    else upsertAgent(id, { lastSeen: now() });
  }
}

function snapshot() {
  const agents = [...state.agents.values()].sort((a, b) => {
    const aw = a.status === 'working' || a.status === 'waiting' ? 0 : 1;
    const bw = b.status === 'working' || b.status === 'waiting' ? 0 : 1;
    if (aw !== bw) return aw - bw;
    return (b.lastSeen || 0) - (a.lastSeen || 0);
  });
  return { agents, events: state.events.slice(-100), pending: [...state.pending.values()] };
}

function serveStatic(reqPath, res) {
  const clean = reqPath === '/' ? '/index.html' : reqPath;
  const file = path.normalize(path.join(WEB_DIR, clean.replace(/^\/+/, '')));
  if (!file.startsWith(WEB_DIR)) return send(res, 403, 'forbidden');
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    const ext = path.extname(file).toLowerCase();
    const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600' });
    fs.createReadStream(file).pipe(res);
    return true;
  }
  // SPA fallback for client routes
  const index = path.join(WEB_DIR, 'index.html');
  if (fs.existsSync(index)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    fs.createReadStream(index).pipe(res);
    return true;
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, '');
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname.replace(/^\/__agent/, '') || '/'; // normalize /__agent/* to legacy API paths

  if (req.method === 'GET' && p === '/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`);
    state.clients.add(res);
    req.on('close', () => state.clients.delete(res));
    return;
  }
  if (req.method === 'GET' && p === '/api/state') return send(res, 200, snapshot());
  if (req.method === 'POST' && p === '/events') {
    try { const e = JSON.parse(await readBody(req) || '{}'); normalizeClaudeEvent(e); emit('hook', e); return send(res, 200, { ok: true }); }
    catch (e) { return send(res, 400, { error: String(e.message || e) }); }
  }
  if (req.method === 'POST' && p === '/permission') {
    try { const body = JSON.parse(await readBody(req) || '{}'); const id = body.permission_id || body.id; if (id && state.pending.has(id)) { const pend = state.pending.get(id); state.pending.delete(id); upsertAgent(pend.agentId, { status: 'waiting', detail: 'permission forwarded' }); } return send(res, 200, { ok: true }); }
    catch (e) { return send(res, 400, { error: String(e.message || e) }); }
  }
  if (req.method === 'POST' && p === '/api/notify-test') { emit('notify', { agentId: 'test', title: 'Agent Town', body: 'Notificações ativas', kind: 'test' }); return send(res, 200, { ok: true }); }

  // Static web build
  if (req.method === 'GET') {
    if (serveStatic(url.pathname, res)) return;
  }
  return send(res, 404, { error: 'not found', hint: 'Place web/index.html (standalone build) next to agent-server.cjs, or use the dev engine setup.' });
});

function writePortFile() { try { fs.mkdirSync(path.dirname(PORT_FILE), { recursive: true }); fs.writeFileSync(PORT_FILE, String(PORT)); } catch {} }
function cleanup() { try { if (fs.existsSync(PORT_FILE) && fs.readFileSync(PORT_FILE, 'utf8').trim() === String(PORT)) fs.unlinkSync(PORT_FILE); } catch {} process.exit(0); }
process.on('SIGINT', cleanup); process.on('SIGTERM', cleanup);
server.listen(PORT, HOST, () => {
  writePortFile();
  console.log(`Agent Town running at http://${HOST}:${PORT}`);
  console.log(`API: http://${HOST}:${PORT}/api/state`);
  if (!fs.existsSync(path.join(WEB_DIR, 'index.html'))) console.log('Warning: web/index.html not found. Build the standalone web first.');
  pollOpenCode(); pollProcesses();
  setInterval(pollOpenCode, 5000);
  setInterval(pollProcesses, 15000);
});
