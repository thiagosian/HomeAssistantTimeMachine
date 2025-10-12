"use client";

import { useState, useEffect } from 'react';
import BackupBrowser from '@/components/BackupBrowser';

export default function Home() {
  const [liveConfigPath, setLiveConfigPath] = useState('');
  const [backupRootPath, setBackupRootPath] = useState('');
  const [isConfigSaved, setIsConfigSaved] = useState(false);

  useEffect(() => {
    const envLivePath = process.env.NEXT_PUBLIC_LIVE_CONFIG_PATH;
    const envBackupPath = process.env.NEXT_PUBLIC_BACKUP_FOLDER_PATH;

    if (envLivePath && envBackupPath) {
      setLiveConfigPath(envLivePath);
      setBackupRootPath(envBackupPath);
      setIsConfigSaved(true);
    } else {
      const savedLivePath = localStorage.getItem('liveConfigPath');
      const savedBackupPath = localStorage.getItem('backupRootPath');
      if (savedLivePath && savedBackupPath) {
        setLiveConfigPath(savedLivePath);
        setBackupRootPath(savedBackupPath);
        setIsConfigSaved(true);
      }
    }
  }, []);

  const handleSaveConfig = (config: { haUrl: string; haToken: string; backupFolderPath: string; liveFolderPath: string }) => {
    localStorage.setItem('liveConfigPath', config.liveFolderPath);
    localStorage.setItem('backupRootPath', config.backupFolderPath);
    localStorage.setItem('haConfig', JSON.stringify({ haUrl: config.haUrl, haToken: config.haToken }));
    setLiveConfigPath(config.liveFolderPath);
    setBackupRootPath(config.backupFolderPath);
    setIsConfigSaved(true);
  };

  if (!isConfigSaved) {
    return (
      <main style={{ minHeight: '100vh', backgroundColor: '#1e1e1e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ width: '100%', maxWidth: '448px' }}>
          <div style={{ backgroundColor: '#2d2d2d', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', border: '1px solid rgba(255, 255, 255, 0.05)', overflow: 'hidden' }}>
            <div style={{ padding: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                <div style={{ width: '64px', height: '64px', background: 'linear-gradient(to bottom right, #3b82f6, #2563eb)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)' }}>
                  <svg style={{ width: '36px', height: '36px', color: 'white' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              
              <h1 style={{ fontSize: '24px', fontWeight: '600', color: 'white', textAlign: 'center', marginBottom: '8px' }}>
                Home Assistant Time Machine
              </h1>
              <p style={{ fontSize: '14px', color: '#9ca3af', textAlign: 'center', marginBottom: '32px' }}>
                Configure your backup locations to get started
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label htmlFor="liveConfigPath" style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Live Config Path
                  </label>
                  <input
                    id="liveConfigPath"
                    type="text"
                    value={liveConfigPath}
                    onChange={(e) => setLiveConfigPath(e.target.value)}
                    placeholder="/path/to/home-assistant/config"
                    style={{ width: '100%', padding: '12px 16px', backgroundColor: '#1e1e1e', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', color: 'white', fontSize: '14px' }}
                  />
                </div>

                <div>
                  <label htmlFor="backupRootPath" style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Backups Root Path
                  </label>
                  <input
                    id="backupRootPath"
                    type="text"
                    value={backupRootPath}
                    onChange={(e) => setBackupRootPath(e.target.value)}
                    placeholder="/path/to/your/backups"
                    style={{ width: '100%', padding: '12px 16px', backgroundColor: '#1e1e1e', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', color: 'white', fontSize: '14px' }}
                  />
                </div>
              </div>

              <button
                onClick={handleSaveConfig}
                style={{ width: '100%', marginTop: '32px', padding: '12px 16px', backgroundColor: '#2563eb', color: 'white', fontWeight: '500', borderRadius: '12px', border: 'none', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.2)' }}
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#1e1e1e', padding: '24px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '48px', height: '48px', background: 'linear-gradient(to bottom right, #3b82f6, #2563eb)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)' }}>
              <svg style={{ width: '28px', height: '28px', color: 'white' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: '600', color: 'white', marginBottom: '4px' }}>Home Assistant Time Machine</h1>
              <p style={{ fontSize: '14px', color: '#9ca3af' }}>Browse and restore backups</p>
            </div>
          </div>
        </header>
        
        <BackupBrowser 
          key={`${liveConfigPath}-${backupRootPath}`}
          liveConfigPath={liveConfigPath}
          backupRootPath={backupRootPath} 
          onSaveConfig={handleSaveConfig}
        />
      </div>
    </main>
  );
}