import React, { useEffect, useState, useRef, useCallback } from 'react';
import { invoke } from '@forge/bridge';
import '@atlaskit/css-reset';

// ─── THEME ───────────────────────────────────────────────────────────────────
const C = {
  primary:    '#0052CC',
  success:    '#00875A',
  warning:    '#FF8B00',
  danger:     '#DE350B',
  bgApp:      '#F4F5F7',
  bgCard:     '#FFFFFF',
  border:     '#DFE1E6',
  text:       '#172B4D',
  textSub:    '#5E6C84',
  textMuted:  '#97A0AF',
};

const s = {
  app:        { fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif', background: C.bgApp, minHeight: '100vh', padding: '20px', color: C.text },
  header:     { background: C.primary, color: '#fff', padding: '18px 22px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' },
  hTitle:     { margin: 0, fontSize: '20px', fontWeight: 700 },
  hSub:       { margin: '3px 0 0', fontSize: '13px', opacity: 0.8 },
  tabs:       { display: 'flex', borderBottom: `2px solid ${C.border}`, marginBottom: '18px' },
  tab:     a  => ({ padding: '10px 20px', cursor: 'pointer', border: 'none', background: 'none', borderBottom: a ? `3px solid ${C.primary}` : '3px solid transparent', marginBottom: '-2px', fontWeight: a ? 700 : 400, color: a ? C.primary : C.textSub, fontSize: '14px' }),
  card:       { background: C.bgCard, borderRadius: '8px', border: `1px solid ${C.border}`, padding: '20px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,.07)' },
  cardTitle:  { fontSize: '15px', fontWeight: 700, marginBottom: '14px' },
  grid2:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  label:      { display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: C.textSub, textTransform: 'uppercase', letterSpacing: '.4px' },
  input:      { width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box', color: C.text, outline: 'none' },
  row:        { display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px' },
  btnP:       { background: C.primary, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  btnO:       { background: '#fff', color: C.primary, border: `2px solid ${C.primary}`, padding: '7px 14px', borderRadius: '4px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  btnG:       { background: C.success, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  btnD:       { background: C.danger, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  badge: ok   => ({ display: 'inline-block', padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: ok ? '#E3FCEF' : '#FFEBE6', color: ok ? C.success : C.danger }),
  alert: t    => ({ padding: '10px 14px', borderRadius: '6px', fontSize: '13px', marginTop: '10px', background: t==='success'?'#E3FCEF':t==='error'?'#FFEBE6':'#FFFAE6', color: t==='success'?C.success:t==='error'?C.danger:C.warning, border:`1px solid ${t==='success'?'#57D9A3':t==='error'?'#FF8F73':'#FFE380'}` }),
  spaceRow: s => ({ border: `2px solid ${s ? C.primary : C.border}`, background: s ? '#DEEBFF' : '#fff', borderRadius: '6px', padding: '12px 14px', cursor: 'pointer', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }),
  logBox:     { background: '#1a1d2e', color: '#a8e6cf', borderRadius: '6px', padding: '14px', fontFamily: 'monospace', fontSize: '12px', maxHeight: '280px', overflowY: 'auto', marginTop: '14px', lineHeight: 1.7 },
  track:      { height: '10px', borderRadius: '5px', background: C.border, overflow: 'hidden', marginTop: '8px' },
  fill: p     => ({ height: '100%', borderRadius: '5px', background: C.primary, width: `${p}%`, transition: 'width 0.4s ease' }),
};

// ─── CREDENTIAL FORM ─────────────────────────────────────────────────────────
function CredForm({ type, onSaved }) {
  const isSource = type === 'source';
  const title = isSource ? 'Source Instance' : 'Destination Instance';

  const [domain,   setDomain]   = useState('');
  const [email,    setEmail]    = useState('');
  const [token,    setToken]    = useState('');
  const [status,   setStatus]   = useState(null);
  const [busy,     setBusy]     = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    invoke('getCredentials', { type }).then((r) => {
      if (r) { setDomain(r.domain); setEmail(r.email); }
    });
  }, [type]);

  const save = async () => {
    if (!domain || !email || !token) { setStatus({ t: 'error', m: 'All fields required.' }); return; }
    setBusy(true);
    await invoke('saveCredentials', { type, domain, email, apiToken: token });
    setBusy(false);
    setStatus({ t: 'success', m: 'Saved! Now click Test Connection.' });
    if (onSaved) onSaved(type, false);
  };

  const test = async () => {
    setBusy(true);
    setStatus(null);
    const r = await invoke('testConnection', { type });
    setBusy(false);
    if (r.success) {
      setStatus({ t: 'success', m: `Connected to ${r.siteTitle}` });
      setConnected(true);
      if (onSaved) onSaved(type, true);
    } else {
      setStatus({ t: 'error', m: r.error });
      setConnected(false);
    }
  };

  return (
    <div style={s.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div style={s.cardTitle}>{title}</div>
        {connected && <span style={s.badge(true)}>Connected</span>}
      </div>

      <div style={{ display: 'grid', gap: '12px' }}>
        <div>
          <label style={s.label}>Domain</label>
          <input style={s.input} value={domain}
            onChange={e => setDomain(e.target.value.replace(/^https?:\/\//,'').replace(/\/$/,''))}
            placeholder="yoursite.atlassian.net" />
          <div style={{ fontSize: '11px', color: C.textMuted, marginTop: '3px' }}>No https:// — just yoursite.atlassian.net</div>
        </div>
        <div>
          <label style={s.label}>Account Email</label>
          <input style={s.input} type="email" value={email}
            onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
        </div>
        <div>
          <label style={s.label}>
            API Token &nbsp;
            <a href="https://id.atlassian.com/manage-profile/security/api-tokens"
               target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: C.primary, fontWeight: 400, textTransform: 'none' }}>
              Generate ↗
            </a>
          </label>
          <input style={s.input} type="password" value={token}
            onChange={e => setToken(e.target.value)} placeholder="••••••••••••••••••••" />
        </div>
        <div style={s.row}>
          <button style={s.btnP} onClick={save} disabled={busy}>{busy ? '…' : 'Save'}</button>
          <button style={s.btnO} onClick={test} disabled={busy}>{busy ? '…' : 'Test Connection'}</button>
        </div>
        {status && <div style={s.alert(status.t)}>{status.m}</div>}
      </div>
    </div>
  );
}

// ─── SPACE SELECTOR ──────────────────────────────────────────────────────────
function SpaceSelector({ onSelect, selectedKey }) {
  const [spaces,  setSpaces]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [filter,  setFilter]  = useState('');

  const load = async () => {
    setLoading(true); setError(null);
    const r = await invoke('fetchSpaces');
    setLoading(false);
    if (r.error) { setError(r.error); return; }
    setSpaces(r.spaces || []);
  };

  const visible = spaces.filter(sp =>
    !filter || sp.name.toLowerCase().includes(filter.toLowerCase()) || sp.key.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div style={s.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={s.cardTitle}>Source Spaces</div>
        <button style={s.btnP} onClick={load} disabled={loading}>
          {loading ? '…' : spaces.length ? 'Refresh' : 'Load Spaces'}
        </button>
      </div>

      {error && <div style={s.alert('error')}>{error}</div>}

      {spaces.length > 0 && (
        <>
          <input style={{ ...s.input, marginBottom: '10px' }}
            value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Filter spaces…" />
          <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
            {visible.map(sp => (
              <div key={sp.key} style={s.spaceRow(selectedKey === sp.key)} onClick={() => onSelect(sp)}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{sp.name}</div>
                  <div style={{ fontSize: '11px', color: C.textMuted, marginTop: '2px' }}>
                    Key: <strong>{sp.key}</strong> · {sp.type}
                  </div>
                </div>
                {selectedKey === sp.key && <span style={s.badge(true)}>Selected</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {spaces.length === 0 && !loading && (
        <div style={{ color: C.textMuted, textAlign: 'center', padding: '28px 0', fontSize: '13px' }}>
          Click "Load Spaces" to fetch spaces from your source instance.
        </div>
      )}
    </div>
  );
}

// ─── LOG LINE ─────────────────────────────────────────────────────────────────
function logColor(line) {
  if (line.includes('✅') || line.includes('✓')) return '#57D9A3';
  if (line.includes('❌') || line.includes('Failed')) return '#FF8F73';
  if (line.includes('⚠'))  return '#FFE380';
  return '#A8E6CF';
}

// ─── MIGRATION PANEL ─────────────────────────────────────────────────────────
function MigrationPanel({ space }) {
  const [phase,    setPhase]    = useState('idle'); // idle | preparing | running | done | error
  const [log,      setLog]      = useState([]);
  const [progress, setProgress] = useState(0);
  const [total,    setTotal]    = useState(0);
  const [errMsg,   setErrMsg]   = useState('');
  const logRef  = useRef(null);
  const running = useRef(false);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const appendLog = useCallback((lines) => {
    setLog(prev => [...prev, ...(Array.isArray(lines) ? lines : [lines])]);
  }, []);

  const runBatches = useCallback(async () => {
    running.current = true;
    setPhase('running');

    while (running.current) {
      const r = await invoke('migrateNextBatch', { batchSize: 5 });

      if (r.error) {
        appendLog(`❌ ${r.error}`);
        setPhase('error');
        setErrMsg(r.error);
        running.current = false;
        return;
      }

      if (r.log) appendLog(r.log);
      setProgress(r.progress);
      setTotal(r.total);

      if (r.done) {
        setPhase('done');
        running.current = false;
        await invoke('finalizeMigration');
        return;
      }

      // Small pause to avoid hammering APIs
      await new Promise(res => setTimeout(res, 400));
    }
  }, [appendLog]);

  const handleStart = async () => {
    if (!space) return;
    setLog([]);
    setProgress(0);
    setTotal(0);
    setErrMsg('');
    setPhase('preparing');

    appendLog(`Preparing migration for space: ${space.name} (${space.key})…`);

    const prepResp = await invoke('prepareMigration', {
      spaceKey: space.key,
      spaceName: space.name,
      spaceDescription: space.description?.plain?.value || '',
    });

    if (prepResp.error) {
      appendLog(`❌ Preparation failed: ${prepResp.error}`);
      setPhase('error');
      setErrMsg(prepResp.error);
      return;
    }

    if (prepResp.log) appendLog(prepResp.log);
    setTotal(prepResp.total || 0);
    appendLog(`Ready — ${prepResp.total} pages queued. Starting batch migration…`);

    await runBatches();
  };

  const handleStop = () => {
    running.current = false;
    setPhase('idle');
    appendLog('⏹ Migration paused. Click Start to resume from where it left off.');
  };

  const handleReset = async () => {
    running.current = false;
    await invoke('finalizeMigration');
    setPhase('idle');
    setLog([]);
    setProgress(0);
    setTotal(0);
  };

  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
  const isRunning = phase === 'preparing' || phase === 'running';

  if (!space) {
    return (
      <div style={s.card}>
        <div style={s.cardTitle}>Migration</div>
        <div style={{ color: C.textMuted, fontSize: '13px' }}>← Select a space first.</div>
      </div>
    );
  }

  return (
    <div style={s.card}>
      <div style={s.cardTitle}>Migration</div>

      {/* Selected space summary */}
      <div style={{ background: '#DEEBFF', border: `1px solid ${C.primary}`, borderRadius: '6px', padding: '12px 14px', marginBottom: '14px' }}>
        <div style={{ fontWeight: 700, fontSize: '14px' }}>{space.name}</div>
        <div style={{ fontSize: '12px', color: C.textSub, marginTop: '2px' }}>Key: <strong>{space.key}</strong></div>
        <div style={{ fontSize: '12px', color: C.textSub, marginTop: '6px' }}>
          Migrates: <strong>pages · hierarchy · content · attachments · comments · labels</strong>
        </div>
      </div>

      {/* Controls */}
      <div style={s.row}>
        {!isRunning && phase !== 'done' && (
          <button style={s.btnG} onClick={handleStart}>▶ {phase === 'idle' ? 'Start Migration' : 'Resume'}</button>
        )}
        {isRunning && (
          <button style={s.btnD} onClick={handleStop}>⏸ Pause</button>
        )}
        {(phase !== 'idle') && (
          <button style={s.btnO} onClick={handleReset}>🔄 Reset</button>
        )}
      </div>

      {/* Progress */}
      {total > 0 && (
        <div style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: C.textSub }}>
            <span>
              {phase === 'preparing' ? 'Preparing…' : phase === 'done' ? 'Complete' : `Migrating pages…`}
            </span>
            <span><strong>{progress}</strong> / {total} pages ({pct}%)</span>
          </div>
          <div style={s.track}><div style={s.fill(pct)} /></div>
        </div>
      )}
      {isRunning && total === 0 && (
        <div style={{ marginTop: '10px', fontSize: '12px', color: C.textSub }}>Preparing…</div>
      )}

      {/* Result banners */}
      {phase === 'done' && (
        <div style={s.alert('success')}>Migration complete! {total} pages migrated to {space.key}.</div>
      )}
      {phase === 'error' && (
        <div style={s.alert('error')}>❌ Error: {errMsg}</div>
      )}

      {/* Log */}
      {log.length > 0 && (
        <div style={s.logBox} ref={logRef}>
          {log.map((line, i) => (
            <div key={i} style={{ color: logColor(line) }}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── STEP BAR ────────────────────────────────────────────────────────────────
const STEPS = ['Connect Source', 'Connect Destination', 'Select Space', 'Migrate'];

function StepBar({ step }) {
  return (
    <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', flexWrap: 'wrap' }}>
      {STEPS.map((label, i) => {
        const done = i + 1 < step;
        const active = i + 1 === step;
        return (
          <div key={i} style={{
            flex: 1, minWidth: '110px', padding: '8px 12px', borderRadius: '6px',
            border: `2px solid ${done ? C.success : active ? C.primary : C.border}`,
            background: done ? '#E3FCEF' : active ? '#DEEBFF' : '#fff',
            color: done ? C.success : active ? C.primary : C.textMuted,
            fontWeight: active || done ? 700 : 400, fontSize: '12px',
            display: 'flex', alignItems: 'center', gap: '5px',
          }}>
            {done ? '✓' : `${i + 1}.`} {label}
          </div>
        );
      })}
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,           setTab]           = useState('connect');
  const [srcConnected,  setSrcConnected]  = useState(false);
  const [dstConnected,  setDstConnected]  = useState(false);
  const [selectedSpace, setSelectedSpace] = useState(null);

  const step = !srcConnected ? 1 : !dstConnected ? 2 : !selectedSpace ? 3 : 4;

  const handleCredStatus = (type, connected) => {
    if (type === 'source') setSrcConnected(connected);
    if (type === 'dest')   setDstConnected(connected);
  };

  return (
    <div style={s.app}>
      {/* Header */}
      <div style={s.header}>
        <span style={{ fontSize: '28px' }}>⚡</span>
        <div>
          <div style={s.hTitle}>Confluence → Confluence Migration</div>
          <div style={s.hSub}>Migrate spaces, pages, hierarchy, attachments, comments and labels between Confluence Cloud instances</div>
        </div>
      </div>

      <StepBar step={step} />

      {/* Tabs */}
      <div style={s.tabs}>
        <button style={s.tab(tab === 'connect')} onClick={() => setTab('connect')}> Connect Instances</button>
        <button style={s.tab(tab === 'migrate')} onClick={() => setTab('migrate')}> Migrate</button>
      </div>

      {/* Connect tab */}
      {tab === 'connect' && (
        <div style={s.grid2}>
          <CredForm type="source" onSaved={handleCredStatus} />
          <CredForm type="dest"   onSaved={handleCredStatus} />
        </div>
      )}

      {/* Migrate tab */}
      {tab === 'migrate' && (
        <div style={s.grid2}>
          <SpaceSelector onSelect={setSelectedSpace} selectedKey={selectedSpace?.key} />
          <MigrationPanel space={selectedSpace} />
        </div>
      )}

      <div style={{ marginTop: '28px', textAlign: 'center', fontSize: '11px', color: C.textMuted }}>
        conf2conf-migration · Forge App · Credentials encrypted via Atlassian Forge Storage
      </div>
    </div>
  );
}