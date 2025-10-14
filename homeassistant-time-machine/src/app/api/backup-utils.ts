import fs from 'fs/promises';
import path from 'path';

export async function createBackup(liveConfigPath: string, backupRootPath: string, timezone: string) {
    const automationsPath = path.join(liveConfigPath, 'automations.yaml');
    const scriptsPath = path.join(liveConfigPath, 'scripts.yaml');

    const date = new Date();
    const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: timezone
    };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
    
    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hours = getPart('hour');
    const minutes = getPart('minute');
    const seconds = getPart('second');

    const timestamp = `${year}-${month}-${day}-${hours}${minutes}${seconds}`;

    const backupDir = path.join(backupRootPath, year.toString(), month, timestamp);
    await fs.mkdir(backupDir, { recursive: true });

    const automationBackupPath = path.join(backupDir, 'automations.yaml');
    await fs.copyFile(automationsPath, automationBackupPath);

    const scriptBackupPath = path.join(backupDir, 'scripts.yaml');
    await fs.copyFile(scriptsPath, scriptBackupPath);

    return { automationBackupPath, scriptBackupPath };
}