import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2'];

function AuthForm({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const { data } = await axios.post(`${API_URL}/api/${mode}`, { email, password });
      onAuth(data.token, data.email);
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Cannot reach server. Try again in 30s (server may be waking up).');
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth" onSubmit={submit}>
        <h1>📡 PulseMesh</h1>
        <p className="muted">Real-time website health monitor with email alerts</p>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <div className="error">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
        <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>
          {mode === 'login' ? 'New here? Create an account' : 'Have an account? Log in'}
        </button>
      </form>
    </div>
  );
}

function Dashboard({ token, email, onLogout }) {
  const [endpoints, setEndpoints] = useState(null);
  const [pings, setPings] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [conn, setConn] = useState('connecting');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);

  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [e, p, i] = await Promise.all([
        axios.get(`${API_URL}/api/endpoints`, auth),
        axios.get(`${API_URL}/api/pings`, auth),
        axios.get(`${API_URL}/api/incidents`, auth),
      ]);
      setEndpoints(e.data); setPings(p.data); setIncidents(i.data);
    } catch (ex) {
      if (ex.response?.status === 401) return onLogout();
      setLoadError('Cannot reach the backend.');
    }
    // eslint-disable-next-line
  }, [token]);

  useEffect(() => {
    load();
    const socket = io(API_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    socket.on('connect', () => { setConn('connected'); load(); });
    socket.on('disconnect', () => setConn('disconnected'));
    socket.on('connect_error', () => setConn('disconnected'));
    socket.on('ping-result', (p) => setPings((prev) => [p, ...prev].slice(0, 200)));
    socket.on('incident-opened', (inc) => {
      setIncidents((prev) => [inc, ...prev.filter((x) => x._id !== inc._id)]);
      toast.error(`🚨 ${inc.endpointName}: ${inc.reason}`);
    });
    socket.on('incident-resolved', (inc) => {
      setIncidents((prev) => prev.map((x) => (x._id === inc._id ? inc : x)));
      toast.success(`✅ ${inc.endpointName} recovered`);
    });
    return () => socket.disconnect();
    // eslint-disable-next-line
  }, [token]);

  const addSite = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      await axios.post(`${API_URL}/api/endpoints`, { name, url }, auth);
      setName(''); setUrl('');
      toast.success('Website added. First check runs within 30 seconds.');
      load();
    } catch (ex) {
      toast.error(ex.response?.data?.error || 'Could not add website');
    } finally { setAdding(false); }
  };

  const removeSite = async (id) => {
    if (!window.confirm('Stop monitoring this website?')) return;
    try { await axios.delete(`${API_URL}/api/endpoints/${id}`, auth); load(); }
    catch { toast.error('Delete failed'); }
  };

  const setMode = async (mode) => {
    try { await axios.post(`${API_URL}/api/synthetic-test/mode`, { mode }, auth); toast(`Synthetic target set to ${mode}`); }
    catch { toast.error('Could not change mode'); }
  };

  const statusOf = (ep) => {
    const last = pings.find((p) => p.endpointId === String(ep._id));
    if (!last) return { s: 'unknown', ms: null };
    if (last.status === 'down') return { s: 'down', ms: last.latencyMs };
    if (last.latencyMs > ep.latencyThresholdMs) return { s: 'slow', ms: last.latencyMs };
    return { s: 'up', ms: last.latencyMs };
  };

  const list = endpoints || [];
  const statuses = list.map(statusOf);
  let banner = { cls: 'checking', text: 'Checking systems…' };
  if (conn === 'disconnected') banner = { cls: 'bad', text: 'Connection lost — retrying…' };
  else if (endpoints && endpoints.length === 0) banner = { cls: 'checking', text: 'No websites yet — add one below' };
  else if (endpoints && statuses.every((x) => x.s === 'up')) banner = { cls: 'ok', text: 'All systems operational' };
  else if (endpoints && statuses.some((x) => x.s === 'unknown')) banner = { cls: 'checking', text: 'Checking systems…' };
  else if (endpoints) banner = { cls: 'bad', text: `${statuses.filter((x) => x.s === 'down' || x.s === 'slow').length} issue(s) detected` };

  const chartData = [...pings].slice(0, 60).reverse()
    .map((p) => ({ time: new Date(p.timestamp).toLocaleTimeString(), [p.endpointName]: p.latencyMs }));

  return (
    <div className="page">
      <header className="top">
        <h1>📡 PulseMesh</h1>
        <div className="who">
          <span className="muted">{email}</span>
          <button className="btn" onClick={onLogout}>Log out</button>
        </div>
      </header>

      <div className={`banner ${banner.cls}`}>{banner.text}
        <span className="conn">socket: {conn}</span></div>

      {loadError && (
        <div className="card error">{loadError} <button className="btn" onClick={load}>Retry</button></div>
      )}

      <form className="card add" onSubmit={addSite}>
        <h3>Add a website to monitor</h3>
        <div className="row">
          <input placeholder="Name (e.g. My Portfolio)" value={name} onChange={(e) => setName(e.target.value)} required />
          <input placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} required />
          <button className="btn primary" disabled={adding}>{adding ? 'Adding…' : 'Add'}</button>
        </div>
        <button type="button" className="link" onClick={() => { setName('Synthetic Test'); setUrl(`${API_URL}/api/synthetic-test`); }}>
          Use demo target (can be broken on command)
        </button>
        <p className="muted small">You’ll get an email at {email} when a site goes down or recovers.</p>
      </form>

      {endpoints === null && !loadError && <p className="muted">Loading…</p>}

      <div className="grid">
        {list.map((ep, i) => {
          const st = statuses[i];
          return (
            <div key={ep._id} className={`card site ${st.s}`}>
              <div className="site-head">
                <strong>{ep.name}</strong>
                <span className={`pill ${st.s}`}>{st.s.toUpperCase()}</span>
              </div>
              <div className="muted small url">{ep.url}</div>
              <div className="ms">{st.ms === null ? '—' : `${st.ms} ms`}</div>
              <button className="link danger" onClick={() => removeSite(ep._id)}>Remove</button>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3>Latency (ms)</h3>
        <div style={{ height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip /><Legend />
              {list.map((ep, i) => (
                <Line key={ep._id} type="monotone" dataKey={ep.name} stroke={COLORS[i % COLORS.length]} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h3>Demo controls (synthetic target)</h3>
        <div className="row">
          <button className="btn" onClick={() => setMode('normal')}>Normal</button>
          <button className="btn" onClick={() => setMode('slow')}>Trigger Slow</button>
          <button className="btn danger-btn" onClick={() => setMode('down')}>Trigger Down</button>
        </div>
      </div>

      <div className="two">
        <div className="card">
          <h3>Recent pings</h3>
          {pings.slice(0, 10).map((p) => (
            <div className="line" key={p._id || p.timestamp + p.endpointId}>
              <span>{p.endpointName}</span>
              <span className={`pill ${p.status}`}>{p.status}</span>
              <span className="muted">{p.latencyMs} ms</span>
            </div>
          ))}
          {pings.length === 0 && <p className="muted small">No data yet.</p>}
        </div>
        <div className="card">
          <h3>Incident log</h3>
          {incidents.map((inc) => (
            <div className="line col" key={inc._id}>
              <span><strong>{inc.endpointName}</strong> — {inc.reason}</span>
              <span className="muted small">
                {new Date(inc.startedAt).toLocaleString()} · {inc.resolvedAt ? `resolved ${new Date(inc.resolvedAt).toLocaleTimeString()}` : '🔴 open'}
              </span>
            </div>
          ))}
          {incidents.length === 0 && <p className="muted small">No incidents.</p>}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('pm_token'));
  const [email, setEmail] = useState(() => sessionStorage.getItem('pm_email'));
  const onAuth = (t, e) => { sessionStorage.setItem('pm_token', t); sessionStorage.setItem('pm_email', e); setToken(t); setEmail(e); };
  const onLogout = () => { sessionStorage.clear(); setToken(null); setEmail(null); };
  return token ? <Dashboard token={token} email={email} onLogout={onLogout} /> : <AuthForm onAuth={onAuth} />;
}