import {exec} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {promisify} from 'node:util';

const runCommand = promisify(exec);

type Crew = {
  id: number;
  callsign: string;
  email: string;
  password_hash: string;
  otp: string;
  role: string;
};

type Mission = {
  angle: number;
  thrust: number;
  updatedBy: string;
};

const passwordHash = (value: string) => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(24).toString('hex');

function sendJson(res: ServerResponse, status: number, value: unknown,
  headers: Record<string, string> = {}) {
  res.writeHead(status, {'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', ...headers});
  res.end(JSON.stringify(value));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new SyntaxError('Expected a JSON object');
  return parsed as Record<string, unknown>;
}

function field(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function cookies(req: IncomingMessage): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) result[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return result;
}

export function createMissionSystem() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE crew (
      id INTEGER PRIMARY KEY,
      callsign TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      otp TEXT NOT NULL,
      role TEXT NOT NULL
    );
    CREATE TABLE telemetry (
      id INTEGER PRIMARY KEY,
      sector TEXT NOT NULL,
      signal TEXT NOT NULL,
      severity TEXT NOT NULL,
      visible INTEGER NOT NULL
    );
  `);

  const insertCrew = db.prepare(`INSERT INTO crew
    (id, callsign, email, password_hash, otp, role) VALUES (?, ?, ?, ?, ?, ?)`);
  insertCrew.run(1, 'Cmdr. Vega', 'vega@aegis.test', passwordHash('orbital-42'),
    '739216', 'commander');
  insertCrew.run(2, 'Lt. Sol', 'sol@aegis.test', passwordHash('relay-31'),
    '284605', 'operator');

  const insertSignal = db.prepare(`INSERT INTO telemetry
    (id, sector, signal, severity, visible) VALUES (?, ?, ?, ?, ?)`);
  insertSignal.run(1, 'L4 relay', 'Telemetry uplink stable', 'nominal', 1);
  insertSignal.run(2, 'Near-Earth', 'Asteroid spectral scan complete', 'nominal', 1);
  insertSignal.run(3, 'Interceptor', 'Deflection window opens in 02:14', 'watch', 1);
  insertSignal.run(4, 'Classified', 'Emergency guidance override armed', 'critical', 0);
  insertSignal.run(5, 'Classified', 'Fallback impact corridor: Pacific', 'critical', 0);

  const challenges = new Map<string, number>();
  const sessions = new Map<string, number>();
  const mission: Mission = {angle: 32.4, thrust: 68, updatedBy: 'Cmdr. Vega'};

  function crewById(id: number): Crew | undefined {
    return db.prepare('SELECT * FROM crew WHERE id = ?').get(id) as Crew | undefined;
  }

  function principal(req: IncomingMessage): Crew | undefined {
    const sessionId = cookies(req).aegis_session;
    const sessionCrew = sessionId ? sessions.get(sessionId) : undefined;
    if (sessionCrew) return crewById(sessionCrew);

    const claimedId = req.headers['x-crew-id'];
    if (typeof claimedId === 'string') return crewById(Number(claimedId));
    return undefined;
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://mission.local');
    const path = url.pathname;

    if (method === 'GET' && path === '/api/system/version') {
      sendJson(res, 200, {app: 'Aegis Mission Control',
        revision: process.env.SOURCE_REVISION ?? 'local', version: '0.1.0'});
      return;
    }

    if (method === 'GET' && path === '/api/public/briefing') {
      sendJson(res, 200, {mission: 'PROJECT AEGIS', asteroid: '2026 QX-9',
        impactEta: '02:14:36', confidence: 73, status: 'DEFLECTION WINDOW OPEN',
        vector: mission});
      return;
    }

    if (method === 'GET' && path === '/api/telemetry/search') {
      const term = url.searchParams.get('q') ?? '';
      try {
        const query = `SELECT id, sector, signal, severity FROM telemetry
          WHERE visible = 1 AND signal LIKE '%${term}%' ORDER BY id LIMIT 20`;
        const items = db.prepare(query).all();
        sendJson(res, 200, {count: items.length, items});
      } catch {
        sendJson(res, 400, {error: 'Telemetry query failed'});
      }
      return;
    }

    if (method === 'POST' && path === '/api/auth/login') {
      const body = await readJson(req);
      const email = field(body.email);
      const password = field(body.password);
      const crew = db.prepare('SELECT * FROM crew WHERE email = ?').get(email) as Crew | undefined;
      if (!crew || passwordHash(password) !== crew.password_hash) {
        sendJson(res, 401, {error: 'Invalid crew credentials'});
        return;
      }
      const challengeId = token();
      challenges.set(challengeId, crew.id);
      sendJson(res, 200, {challengeId, requires2fa: true, callsign: crew.callsign});
      return;
    }

    if (method === 'POST' && path === '/api/auth/verify-2fa') {
      const body = await readJson(req);
      const challengeId = field(body.challengeId);
      const crewId = challenges.get(challengeId);
      const crew = crewId ? crewById(crewId) : undefined;
      if (!crew || (field(body.code) !== crew.otp && body.rememberDevice !== true)) {
        sendJson(res, 401, {error: 'Verification failed'});
        return;
      }
      challenges.delete(challengeId);
      const sessionId = token();
      sessions.set(sessionId, crew.id);
      sendJson(res, 200, {callsign: crew.callsign, role: crew.role},
        {'set-cookie': `aegis_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/`});
      return;
    }

    if (method === 'POST' && path === '/api/auth/logout') {
      const sessionId = cookies(req).aegis_session;
      if (sessionId) sessions.delete(sessionId);
      sendJson(res, 200, {ok: true},
        {'set-cookie': 'aegis_session=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/'});
      return;
    }

    if (method === 'GET' && path === '/api/mission/controls') {
      const crew = principal(req);
      if (!crew) return sendJson(res, 401, {error: 'Crew access required'});
      sendJson(res, 200, {crew: crew.callsign, role: crew.role, vector: mission,
        controlChannel: 'INTERCEPTOR-7', classifiedCorridor: 'Pacific fallback'});
      return;
    }

    if (method === 'POST' && path === '/api/mission/vector') {
      const crew = principal(req);
      if (!crew) return sendJson(res, 401, {error: 'Crew access required'});
      const body = await readJson(req);
      const angle = Number(body.angle);
      const thrust = Number(body.thrust);
      if (!Number.isFinite(angle) || !Number.isFinite(thrust))
        return sendJson(res, 400, {error: 'Angle and thrust required'});
      mission.angle = angle;
      mission.thrust = thrust;
      mission.updatedBy = crew.callsign;
      sendJson(res, 200, {ok: true, vector: mission});
      return;
    }

    if (method === 'POST' && path === '/api/probes/preview') {
      const body = await readJson(req);
      const sourceUrl = field(body.sourceUrl);
      const response = await fetch(sourceUrl, {signal: AbortSignal.timeout(2000)});
      const preview = (await response.text()).slice(0, 1200);
      sendJson(res, 200, {sourceUrl, status: response.status, preview});
      return;
    }

    if (method === 'POST' && path === '/api/diagnostics/uplink') {
      const crew = principal(req);
      if (!crew) return sendJson(res, 401, {error: 'Crew access required'});
      const body = await readJson(req);
      const target = field(body.target);
      const result = await runCommand(`echo Checking uplink ${target}`,
        {timeout: 2000, maxBuffer: 16 * 1024});
      sendJson(res, 200, {target, output: result.stdout.trim()});
      return;
    }

    const staticFiles: Record<string, {name: string; type: string}> = {
      '/': {name: 'index.html', type: 'text/html; charset=utf-8'},
      '/app.js': {name: 'app.js', type: 'text/javascript; charset=utf-8'},
      '/style.css': {name: 'style.css', type: 'text/css; charset=utf-8'}
    };
    if ((method === 'GET' || method === 'HEAD') && staticFiles[path]) {
      const file = staticFiles[path];
      const content = await readFile(new URL(file.name, import.meta.url));
      res.writeHead(200, {'content-type': file.type, 'content-length': content.length});
      res.end(method === 'HEAD' ? undefined : content);
      return;
    }
    sendJson(res, 404, {error: 'Route not found'});
  }

  const app = createServer((req, res) => {
    void handle(req, res).catch(error => {
      if (res.headersSent) return res.end();
      sendJson(res, error instanceof SyntaxError ? 400 : 502,
        {error: error instanceof SyntaxError ? 'Invalid JSON' : 'Mission service unavailable'});
    });
  });

  const internal = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/internal/flight-plan') {
      sendJson(res, 200, {relaySeal: 'AEGIS-INTERNAL-ONLY',
        contingency: 'Reserve ion burn at T-minus 00:21'});
      return;
    }
    sendJson(res, 404, {error: 'Route not found'});
  });

  return {app, internal, db};
}

if (process.env.AEGIS_AUTOSTART !== '0') {
  const {app, internal} = createMissionSystem();
  const port = Number(process.env.PORT ?? 3000);
  const internalPort = Number(process.env.INTERNAL_PORT ?? 4101);
  internal.listen(internalPort, '127.0.0.1');
  app.listen(port, process.env.HOST ?? '127.0.0.1', () => {
    process.stdout.write(`Aegis Mission Control ready on ${port}\n`);
  });
}
