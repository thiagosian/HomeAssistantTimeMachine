
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

interface Automation {
    id?: string;
    alias?: string;
    description?: string;
    trigger: any[];
    condition?: any[];
    action: any[];
    mode?: string;
}

export async function POST(request: Request) {
  try {
    const { liveConfigPath, automationObject } = await request.json();

    if (!liveConfigPath || !automationObject) {
      return NextResponse.json({ error: 'liveConfigPath and automationObject are required' }, { status: 400 });
    }

    if (liveConfigPath.includes('..')) {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const automationsPath = path.join(liveConfigPath, 'automations.yaml');
    const backupPath = `${automationsPath}.${Date.now()}.bak`;

    // 1. Create a backup of the current file
    await fs.copyFile(automationsPath, backupPath);

    // 2. Read the live automations file
    const fileContent = await fs.readFile(automationsPath, 'utf8');
    let automations = yaml.load(fileContent) as Automation[];

    if (!Array.isArray(automations)) {
        // If the file is empty or invalid, start with an empty array
        automations = [];
    }

    const identifier = automationObject.id || automationObject.alias;
    if (!identifier) {
        return NextResponse.json({ error: 'Automation to restore must have an id or alias.' }, { status: 400 });
    }

    // 3. Find and replace/append
    const indexToReplace = automations.findIndex(auto => auto.id === identifier || auto.alias === identifier);

    if (indexToReplace !== -1) {
        // Replace existing automation
        automations[indexToReplace] = automationObject;
    } else {
        // Append new automation
        automations.push(automationObject);
    }

    // 4. Convert back to YAML and write to the file
    const newYamlContent = yaml.dump(automations);
    await fs.writeFile(automationsPath, newYamlContent, 'utf8');

    return NextResponse.json({ message: 'Automation restored successfully!', backup: backupPath });

  } catch (error: unknown) {
    const err = error as Error;
    console.error(err);
    return NextResponse.json({ error: 'Failed to restore automation.', details: err.message }, { status: 500 });
  }
}
