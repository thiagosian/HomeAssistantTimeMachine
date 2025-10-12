
import { useState, useEffect } from 'react';

interface ConfigMenuProps {
  onClose: () => void;
  onSave: (config: { haUrl: string; haToken: string; backupFolderPath: string; liveFolderPath: string }) => void;
  initialBackupFolderPath: string;
  initialLiveFolderPath: string;
  liveConfigPathError: string | null;
}

export default function ConfigMenu({ onClose, onSave, initialBackupFolderPath, initialLiveFolderPath, liveConfigPathError }: ConfigMenuProps) {
  const [haUrl, setHaUrl] = useState('');
  const [haToken, setHaToken] = useState('');
  const [backupFolderPath, setBackupFolderPath] = useState(initialBackupFolderPath);
  const [liveFolderPath, setLiveFolderPath] = useState(initialLiveFolderPath);
  const [testConnectionMessage, setTestConnectionMessage] = useState<string | null>(null);

  useEffect(() => {
    const savedConfig = localStorage.getItem('haConfig');
    if (savedConfig) {
      const { haUrl, haToken } = JSON.parse(savedConfig);
      setHaUrl(haUrl || '');
      setHaToken(haToken || '');
    }
  }, []);

  const handleSave = () => {
    const config = { haUrl, haToken, backupFolderPath, liveFolderPath };
    localStorage.setItem('haConfig', JSON.stringify({ haUrl, haToken }));
    onSave(config);
    onClose();
  };

  const handleTestConnection = async () => {
    setTestConnectionMessage('Testing connection...');
    try {
      const response = await fetch('/api/test-home-assistant-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ haUrl, haToken }),
      });
      const data = await response.json();
      setTestConnectionMessage(data.message);
    } catch (error) {
      setTestConnectionMessage('Failed to connect to API.');
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div style={{ backgroundColor: '#2d2d2d', padding: '24px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.05)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', width: '400px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'white', marginBottom: '16px' }}>Configuration</h2>
        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="haUrl" style={{ display: 'block', color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Home Assistant URL</label>
          <input
            id="haUrl"
            type="text"
            value={haUrl}
            onChange={(e) => setHaUrl(e.target.value)}
            placeholder="http://homeassistant.local:8123"
            style={{ width: '100%', padding: '12px', backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', color: 'white', fontSize: '14px' }}
          />
        </div>
        <div style={{ marginBottom: '24px' }}>
          <label htmlFor="haToken" style={{ display: 'block', color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Long-Lived Access Token</label>
          <input
            id="haToken"
            type="password"
            value={haToken}
            onChange={(e) => setHaToken(e.target.value)}
            style={{ width: '100%', padding: '12px', backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', color: 'white', fontSize: '14px' }}
          />
          <button
            onClick={handleTestConnection}
            style={{ marginTop: '12px', padding: '8px 16px', borderRadius: '8px', fontWeight: '500', fontSize: '14px', border: '1px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer', backgroundColor: 'transparent', color: '#9ca3af' }}
          >
            Test Connection
          </button>
          {testConnectionMessage && (
            <p style={{ marginTop: '8px', fontSize: '12px', color: testConnectionMessage.includes('successful') ? '#4CAF50' : '#ef4444' }}>
              {testConnectionMessage}
            </p>
          )}
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="backupFolderPath" style={{ display: 'block', color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Backup Folder Path</label>
          <input
            id="backupFolderPath"
            type="text"
            value={backupFolderPath}
            onChange={(e) => setBackupFolderPath(e.target.value)}
            placeholder="/path/to/backups"
            style={{ width: '100%', padding: '12px', backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', color: 'white', fontSize: '14px' }}
          />
        </div>
        <div style={{ marginBottom: '24px' }}>
          <label htmlFor="liveFolderPath" style={{ display: 'block', color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Live Home Assistant Folder Path</label>
          <input
            id="liveFolderPath"
            type="text"
            value={liveFolderPath}
            onChange={(e) => setLiveFolderPath(e.target.value)}
            style={{ width: '100%', padding: '12px', backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', color: 'white', fontSize: '14px' }}
          />
          {liveConfigPathError && <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>{liveConfigPathError}</p>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button onClick={onClose} style={{ padding: '10px 24px', borderRadius: '8px', fontWeight: '500', fontSize: '14px', border: '1px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer', backgroundColor: 'transparent', color: '#9ca3af' }}>
            Cancel
          </button>
          <button onClick={handleSave} style={{ padding: '10px 24px', borderRadius: '8px', fontWeight: '500', fontSize: '14px', border: 'none', cursor: 'pointer', backgroundColor: '#2563eb', color: 'white' }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
