import { NextResponse } from 'next/server';
import * as cron from 'node-cron';
import fs from 'fs/promises';
import path from 'path';
import { createBackup } from '../backup-utils';

const SCHEDULE_FILE = path.resolve('/data', 'scheduled-jobs.json');

// Function to read scheduled jobs from file
async function readScheduledJobs() {
  try {
    const data = await fs.readFile(SCHEDULE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}; // File not found, return empty object
    }
    console.error('Error reading scheduled jobs file:', error);
    return {};
  }
}

// Function to write scheduled jobs to file
async function writeScheduledJobs(jobs: object) {
  try {
    await fs.writeFile(SCHEDULE_FILE, JSON.stringify(jobs, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing scheduled jobs file:', error);
  }
}

// Store cron tasks in memory to manage them
const scheduledTasks: { [key: string]: cron.ScheduledTask } = {};

// Function to execute the backup script
function runBackupScript(backupFolderPath: string, liveFolderPath: string, timezone: string) {
  console.log('Attempting to run backup script...');
  createBackup(liveFolderPath, backupFolderPath, timezone)
    .then(() => console.log('Backup script finished.'))
    .catch(error => console.error(`exec error: ${error}`));
}

// Initialize scheduled tasks on server start
(async () => {
  console.log('Initializing scheduled tasks...');
  const jobs = await readScheduledJobs();
  for (const id in jobs) {
    const { cronExpression, enabled, backupFolderPath, liveFolderPath, timezone } = jobs[id];
    if (enabled && backupFolderPath && liveFolderPath) {
      scheduledTasks[id] = cron.schedule(cronExpression, () => runBackupScript(backupFolderPath, liveFolderPath, timezone || 'UTC'));
    }
  }
  console.log('Scheduled tasks initialization complete.');
})();


export async function POST(request: Request) {
  try {
    const { cronExpression, enabled, id, backupFolderPath, liveFolderPath, timezone } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    const jobs = await readScheduledJobs();

    if (enabled) {
      if (!cron.validate(cronExpression)) {
        return NextResponse.json({ error: 'Invalid cron expression' }, { status: 400 });
      }

      // If a task with this ID already exists, destroy it first
      if (scheduledTasks[id]) {
        scheduledTasks[id].destroy();
        console.log(`Destroyed existing task for job ID: ${id}`);
      }

      scheduledTasks[id] = cron.schedule(cronExpression, () => runBackupScript(backupFolderPath, liveFolderPath, timezone || 'UTC'));
      jobs[id] = { cronExpression, enabled: true, backupFolderPath, liveFolderPath, timezone };
      console.log(`Scheduled job ${id} with cron: ${cronExpression}, backupPath: ${backupFolderPath}, livePath: ${liveFolderPath}, timezone: ${timezone}`);
    } else {
      // If disabling, destroy the cron task
      if (scheduledTasks[id]) {
        scheduledTasks[id].destroy();
        delete scheduledTasks[id];
        console.log(`Destroyed task for job ID: ${id}`);
      }
      delete jobs[id]; // Remove from persistent storage if disabled
      console.log(`Disabled and removed job ID: ${id}`);
    }

    await writeScheduledJobs(jobs);

    return NextResponse.json({ message: 'Backup schedule updated successfully', jobs });
  } catch (error) {
    console.error('Failed to update backup schedule:', error);
    return NextResponse.json({ error: 'Failed to update backup schedule.' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const jobs = await readScheduledJobs();
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('Failed to retrieve backup schedules:', error);
    return NextResponse.json({ error: 'Failed to retrieve backup schedules.' }, { status: 500 });
  }
}
