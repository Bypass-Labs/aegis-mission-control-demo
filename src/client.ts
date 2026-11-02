type ApiResult<T> = {ok: boolean; status: number; data: T};
type Briefing = {impactEta: string; confidence: number; status: string;
  vector: {angle: number; thrust: number; updatedBy: string}};
type Telemetry = {id: number; sector: string; signal: string; severity: string};
type TelemetryResult = {count: number; items: Telemetry[]};
type LoginResult = {challengeId?: string; callsign?: string; error?: string};
type ControlsResult = {crew?: string; role?: string; error?: string};
type MissionEvent = {id: number; time: string; message: string};

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = (id: string) => element<HTMLFormElement>(id);

async function api<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  const response = await fetch(path, {credentials: 'same-origin', ...options});
  return {ok: response.ok, status: response.status, data: await response.json() as T};
}

function post<T>(path: string, body: Record<string, unknown>) {
  return api<T>(path, {method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify(body)});
}

function logEvent(message: string) {
  const row = document.createElement('li');
  const time = document.createElement('time');
  time.textContent = new Date().toISOString().slice(11, 16);
  const description = document.createElement('span');
  description.textContent = message;
  row.append(time, description);
  const log = element<HTMLUListElement>('eventLog');
  log.prepend(row);
  while (log.children.length > 5) log.lastElementChild?.remove();
}

function showCrew(callsign: string | null) {
  const active = Boolean(callsign);
  element('crewStatus').textContent = active ?
    `${callsign} connected. Interceptor controls are available.` :
    'Authenticate to access the interceptor controls.';
  const tag = element('crewTag');
  tag.textContent = active ? 'CONNECTED' : 'LOCKED';
  tag.classList.toggle('unlocked', active);
  element('vectorTag').classList.toggle('unlocked', active);
  element('vectorTag').textContent = active ? 'ARMED' : 'CREW ONLY';
  form('loginForm').classList.toggle('hidden', active);
  element('logoutButton').classList.toggle('hidden', !active);
  form('vectorForm').querySelector<HTMLButtonElement>('button')!.disabled = !active;
  form('uplinkForm').querySelector<HTMLButtonElement>('button')!.disabled = !active;
}

async function loadBriefing() {
  const result = await api<Briefing>('/api/public/briefing');
  if (!result.ok) return;
  const {confidence, status, vector} = result.data;
  const critical = confidence < 30;
  document.body.classList.toggle('mission-critical', critical);
  element('statusTitle').textContent = status;
  element('statusDetail').textContent = critical ?
    'Interceptor vector is outside the safe deflection corridor.' :
    'Interceptor ready for trajectory lock';
  element('confidence').textContent = `${confidence}%`;
  element('confidenceBar').style.width = `${confidence}%`;
  element('angle').textContent = vector.angle.toFixed(1);
  element('thrust').textContent = String(vector.thrust);
  element('updatedBy').textContent = vector.updatedBy;
  form('vectorForm').querySelector<HTMLInputElement>('input[name="angle"]')!.value = String(vector.angle);
  form('vectorForm').querySelector<HTMLInputElement>('input[name="thrust"]')!.value = String(vector.thrust);
}

let lastEventId = 0;
async function loadEvents() {
  const result = await api<{items: MissionEvent[]}>('/api/public/events');
  if (!result.ok) return;
  for (const item of result.data.items) {
    if (item.id > lastEventId) logEvent(item.message);
    lastEventId = Math.max(lastEventId, item.id);
  }
}

async function loadTelemetry(query = '') {
  const result = await api<TelemetryResult>(`/api/telemetry/search?q=${encodeURIComponent(query)}`);
  const rows = element<HTMLTableSectionElement>('telemetryRows');
  rows.replaceChildren();
  if (!result.ok || !result.data.items.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.textContent = result.ok ? 'No matching signals.' : 'Telemetry unavailable.';
    row.append(cell);
    rows.append(row);
    return;
  }
  for (const item of result.data.items) {
    const row = document.createElement('tr');
    for (const value of [item.sector, item.signal, item.severity]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    rows.append(row);
  }
}

async function loadCrew() {
  const result = await api<ControlsResult>('/api/mission/controls');
  showCrew(result.ok ? result.data.crew ?? null : null);
}

let challengeId = '';

form('loginForm').addEventListener('submit', event => {
  event.preventDefault();
  const values = new FormData(form('loginForm'));
  void post<LoginResult>('/api/auth/login', {
    email: values.get('email'), password: values.get('password')
  }).then(result => {
    if (!result.ok || !result.data.challengeId) {
      element('crewStatus').textContent = result.data.error ?? 'Crew login failed.';
      logEvent('Crew credential check rejected.');
      return;
    }
    challengeId = result.data.challengeId;
    form('loginForm').classList.add('hidden');
    form('otpForm').classList.remove('hidden');
    element('crewStatus').textContent = `Second-factor challenge for ${result.data.callsign}.`;
    logEvent('Crew password accepted; second factor requested.');
  }).catch(() => logEvent('Crew link unavailable.'));
});

form('otpForm').addEventListener('submit', event => {
  event.preventDefault();
  const values = new FormData(form('otpForm'));
  void post<ControlsResult>('/api/auth/verify-2fa', {
    challengeId, code: values.get('code'), rememberDevice: values.get('rememberDevice') === 'on'
  }).then(async result => {
    if (!result.ok) {
      element('crewStatus').textContent = result.data.error ?? 'Verification failed.';
      logEvent('Second-factor check rejected.');
      return;
    }
    form('otpForm').classList.add('hidden');
    await loadCrew();
    logEvent('Crew identity verified; control channel connected.');
  }).catch(() => logEvent('Verification link unavailable.'));
});

element<HTMLButtonElement>('logoutButton').addEventListener('click', () => {
  void post('/api/auth/logout', {}).then(() => {
    challengeId = '';
    showCrew(null);
    logEvent('Crew session disconnected.');
  });
});

form('searchForm').addEventListener('submit', event => {
  event.preventDefault();
  const query = String(new FormData(form('searchForm')).get('q') ?? '');
  void loadTelemetry(query).then(() => logEvent(`Signal search completed for “${query}”.`));
});

form('vectorForm').addEventListener('submit', event => {
  event.preventDefault();
  const values = new FormData(form('vectorForm'));
  void post<{ok?: boolean; error?: string}>('/api/mission/vector', {
    angle: Number(values.get('angle')), thrust: Number(values.get('thrust'))
  }).then(async result => {
    if (!result.ok) return logEvent(result.data.error ?? 'Vector update rejected.');
    await Promise.all([loadBriefing(), loadEvents()]);
  });
});

form('previewForm').addEventListener('submit', event => {
  event.preventDefault();
  const sourceUrl = String(new FormData(form('previewForm')).get('sourceUrl') ?? '');
  element('previewResult').textContent = 'Contacting observatory…';
  void post<{status?: number; preview?: string; error?: string}>('/api/probes/preview',
    {sourceUrl}).then(result => {
    element('previewResult').textContent = result.ok ?
      `HTTP ${result.data.status}\n${result.data.preview ?? ''}` :
      result.data.error ?? 'Feed unavailable.';
    logEvent(result.ok ? 'Remote feed preview received.' : 'Remote feed preview failed.');
  });
});

form('uplinkForm').addEventListener('submit', event => {
  event.preventDefault();
  const target = String(new FormData(form('uplinkForm')).get('target') ?? '');
  void post<{output?: string; error?: string}>('/api/diagnostics/uplink', {target})
    .then(result => {
      element('uplinkResult').textContent = result.ok ? result.data.output ?? '' :
        result.data.error ?? 'Uplink unavailable.';
      logEvent(result.ok ? 'Uplink diagnostic completed.' : 'Uplink diagnostic rejected.');
    });
});

let countdown = 2 * 60 * 60 + 14 * 60 + 36;
setInterval(() => {
  countdown = Math.max(0, countdown - 1);
  const hours = Math.floor(countdown / 3600);
  const minutes = Math.floor((countdown % 3600) / 60);
  const seconds = countdown % 60;
  element('countdown').textContent = [hours, minutes, seconds]
    .map(value => String(value).padStart(2, '0')).join(':');
}, 1000);

void Promise.allSettled([
  loadBriefing(), loadTelemetry(), loadCrew(), loadEvents(),
  api<{revision: string}>('/api/system/version').then(result => {
    if (result.ok) element('revision').textContent = result.data.revision.slice(0, 7).toUpperCase();
  })
]);

setInterval(() => {
  void Promise.allSettled([loadBriefing(), loadEvents()]);
}, 4000);
