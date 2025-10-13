"use client";

import { useState, useEffect } from 'react';
import BackupBrowser from '@/components/BackupBrowser';

export default function Home() {
  const [liveConfigPath, setLiveConfigPath] = useState('');
  const [backupRootPath, setBackupRootPath] = useState('');

  useEffect(() => {
    const savedLivePath = localStorage.getItem('liveConfigPath');
    const savedBackupPath = localStorage.getItem('backupRootPath');
    if (savedLivePath) {
      setLiveConfigPath(savedLivePath);
    }
    if (savedBackupPath) {
      setBackupRootPath(savedBackupPath);
    }
  }, []);

  const handleSaveConfig = (config: { haUrl: string; haToken: string; backupFolderPath: string; liveFolderPath: string }) => {
    setLiveConfigPath(config.liveFolderPath);
    setBackupRootPath(config.backupFolderPath);
    localStorage.setItem('liveConfigPath', config.liveFolderPath);
    localStorage.setItem('backupRootPath', config.backupFolderPath);
  };

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