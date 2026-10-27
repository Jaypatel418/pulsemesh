import { useEffect, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer
} from 'recharts';
import { toast } from 'sonner';
import './App.css';

const API_URL = 'https://pulsemesh-x1fk.onrender.com';
const socket = io(API_URL, { transports: ['websocket', 'polling'] });
const COLORS = ['#4f46e5', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899'];

function App() {
  const [endpoints, setEndpoints] = useState([]);
  const [pings, setPings] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [token, setToken] = useState(null);
  const [mode, setMode] = useState('normal');

  const login = async () => {
    const res = await axios.post(`${API_URL}/api/login`, {
      username: 'admin',
      password: 'pulsemesh123'
    });
    setToken(res.data.token);
    return res.data.token;
  };

  const triggerMode = async (newMode) => {
    try {
      const t = token || (await login());
      await axios.post(
        `${API_URL}/api/synthetic-test/mode`,
        { mode: newMode },
        { headers: { Authorization: `Bearer ${t}` } }
      );
      setMode(newMode);
      toast.info(`Synthetic Test set to "${newMode}" mode`);
    } catch (err) {
      toast.error('Could not change mode');
    }
  };

  useEffect(() => {
    login().catch(() => {});
    axios.get(`${API_URL}/api/endpoints`).then(res => setEndpoints(res.data));

    socket.on('ping-result', (data) => {
      setPings(prev => [...prev.slice(-39), data]);
    });

    socket.on('incident-opened', (data) => {
      setIncidents(prev => [{ ...data, status: 'open' }, ...prev]);
      toast.error(`🚨 Incident: ${data.endpointName} — ${data.reason}`);
    });

    socket.on('incident-resolved', (data) => {
      setIncidents(prev =>
        prev.map(inc =>
          inc.endpointId === data.endpointId && inc.status === 'open'
            ? { ...inc, status: 'resolved', resolvedAt: data.resolvedAt }
            : inc
        )
      );
      toast.success(`✅ Resolved: ${data.endpointName} is back to normal`);
    });

    return () => {
      socket.off('ping-result');
      socket.off('incident-opened');
      socket.off('incident-resolved');
    };
  }, []);

  const latest = {};
  pings.forEach(p => { latest[p.endpointName] = p; });

  const openIncidents = incidents.filter(i => i.status === 'open');

  const chartData = pings.map(p => ({
    time: new Date(p.timestamp).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }),
    [p.endpointName]: p.latencyMs
  }));

  const getState = (ep) => {
    const p = latest[ep.name];
    if (!p) return 'unknown';
    if (p.status === 'down') return 'down';
    if (p.latencyMs > ep.latencyThresholdMs) return 'slow';
    return 'up';
  };

  const stateLabel = { up: 'Operational', down: 'Down', slow: 'Slow', unknown: 'Waiting…' };

  return (
    <div className="page">
      <div className="header">
        <div className="header-inner">
          <h1>PulseMesh</h1>
          <p>Real-Time API Health Monitor & Synthetic Latency Telemetry Hub</p>
        </div>
      </div>

      <div className="container">
        <div className={`banner ${openIncidents.length ? 'bad' : 'good'}`}>
          <span style={{ fontSize: 26 }}>{openIncidents.length ? '🚨' : '✅'}</span>
          <div>
            {openIncidents.length
              ? `${openIncidents.length} incident${openIncidents.length > 1 ? 's' : ''} ongoing`
              : 'All systems operational'}
            <small>
              {openIncidents.length
                ? openIncidents.map(i => i.endpointName).join(', ')
                : 'Every monitored endpoint is responding normally'}
            </small>
          </div>
        </div>

        <div className="card">
          <h2>Demo Controls — Synthetic Test endpoint</h2>
          <div className="controls">
            <span className="label">Simulate:</span>
            <button className={mode === 'normal' ? 'active-normal' : ''} onClick={() => triggerMode('normal')}>
              Normal
            </button>
            <button className={mode === 'slow' ? 'active-slow' : ''} onClick={() => triggerMode('slow')}>
              Trigger Slow
            </button>
            <button className={mode === 'down' ? 'active-down' : ''} onClick={() => triggerMode('down')}>
              Trigger Down
            </button>
          </div>
        </div>

        <div className="endpoint-grid">
          {endpoints.map(ep => {
            const state = getState(ep);
            const p = latest[ep.name];
            return (
              <div className={`ep-card ${state}`} key={ep._id}>
                <div className="ep-top">
                  <span className="ep-name">{ep.name}</span>
                  <span className={`pill ${state}`}>{stateLabel[state]}</span>
                </div>
                <div className="ep-latency">
                  {p ? p.latencyMs : '—'}<span>ms</span>
                </div>
                <div className="ep-url">{ep.url}</div>
              </div>
            );
          })}
        </div>

        <div className="card">
          <h2>Live Latency</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} unit="ms" />
              <Tooltip />
              <Legend />
              {endpoints.map((ep, i) => (
                <Line
                  key={ep._id}
                  type="monotone"
                  dataKey={ep.name}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="two-col">
          <div className="card">
            <h2>Recent Pings</h2>
            {pings.length === 0 && <div className="empty">Waiting for the first ping…</div>}
            {pings.slice(-10).reverse().map((p, i) => (
              <div className="row" key={i}>
                <span>{p.endpointName}</span>
                <span className={`pill ${p.status === 'up' ? 'up' : 'down'}`}>{p.status}</span>
                <span className="muted">{p.latencyMs}ms</span>
              </div>
            ))}
          </div>

          <div className="card">
            <h2>Incident Log</h2>
            {incidents.length === 0 && <div className="empty">No incidents yet.</div>}
            {incidents.map((inc, i) => (
              <div className="row" key={i}>
                <span>{inc.endpointName}</span>
                <span className="muted">{inc.reason}</span>
                <span className={inc.status === 'open' ? 'badge-open' : 'badge-resolved'}>
                  {inc.status === 'open' ? 'ONGOING' : 'Resolved'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;