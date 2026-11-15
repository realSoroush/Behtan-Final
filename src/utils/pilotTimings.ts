const phases = ['auth', 'case', 'catalog', 'solve', 'stage', 'publish', 'total'] as const;
type TimingPhase = typeof phases[number];

type PilotSample =
  | { event: 'otp_send' | 'sms_seen'; elapsed_ms: number; status: 'ok' | 'failed'; code?: string }
  | { event: 'generate'; elapsed_ms: number; status: number; menus: number; request_id?: string; phases_ms?: Partial<Record<TimingPhase, number>> };

const samples: (PilotSample & { at: string })[] = [];

export function pilotTimingsEnabled() {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('pilot') === '1';
}

export function recordPilotTiming(sample: PilotSample) {
  if (!pilotTimingsEnabled()) return;
  samples.push({ ...sample, elapsed_ms: Math.round(sample.elapsed_ms), at: new Date().toISOString() });
  if (samples.length > 40) samples.shift();
}

export function readPilotTimings() {
  return JSON.stringify({ version: 1, samples }, null, 2);
}

export function clearPilotTimings() {
  samples.length = 0;
}

export function parsePilotServerTiming(header: string | null) {
  const timing: Partial<Record<TimingPhase, number>> = {};
  for (const field of header?.split(',') ?? []) {
    const match = /^([a-z]+);dur=(\d+(?:\.\d+)?)$/.exec(field.trim());
    const phase = phases.find(name => name === match?.[1]);
    if (phase && match) timing[phase] = Number(match[2]);
  }
  return timing;
}
