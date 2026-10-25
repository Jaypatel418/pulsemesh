import { useEffect, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import './App.css';
import { toast } from 'sonner';

const API_URL = 'http://localhost:5001';
const socket = io(API_URL);

function App() {
  const [endpoints, setEndpoints] = useState([]);
  const [pings, setPings] = useState([]);
  const [incidents, setIncidents] = useState([]);

  const triggerMode = async (mode) => {
    await axios.post(`${API_URL}/api/synthetic-test/mode`, { mode });
  };

  useEffect(() => {
    axios.get(`${API_URL}/api/endpoints`).then(res => setEndpoints(res.data));

    socket.on('ping-result', (data) => {
      setPings(prev => [...prev.slice(-29), data]);
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

  return (
    <div className="dashboard">
      <h1>PulseMesh</h1>
      <p className="subtitle">Real-Time API Health Monitor & Synthetic Latency Telemetry Hub</p>

      <div className="controls">
        <button className="btn-normal" onClick={() => triggerMode('normal')}>Normal</button>
        <button className="btn-slow" onClick={() => triggerMode('slow')}>Trigger Slow</button>
        <button className="btn-down" onClick={() => triggerMode('down')}>Trigger Down</button>
      </div>

      <div className="card">
        <h2>Monitored Endpoints</h2>
        {endpoints.map(ep => (
          <div className="endpoint-item" key={ep._id}>
            <span>{ep.name}</span>
            <span style={{ color: '#94a3b8' }}>{ep.url}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Live Latency</h2>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={pings}>
            <XAxis dataKey="endpointName" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
            <Line type="monotone" dataKey="latencyMs" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h2>Recent Pings</h2>
        {pings.slice().reverse().map((p, i) => (
          <div className="ping-item" key={i}>
            <span>{p.endpointName}</span>
            <span className={p.status === 'up' ? 'status-up' : 'status-down'}>{p.status}</span>
            <span>{p.latencyMs}ms</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Incident Log</h2>
        {incidents.length === 0 && <p style={{ color: '#64748b' }}>No incidents yet.</p>}
        {incidents.map((inc, i) => (
          <div className="incident-item" key={i}>
            <span>{inc.endpointName}</span>
            <span style={{ color: '#94a3b8' }}>{inc.reason}</span>
            <span className={inc.status === 'open' ? 'incident-open' : 'incident-resolved'}>
              {inc.status === 'open' ? 'ONGOING' : 'Resolved'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;