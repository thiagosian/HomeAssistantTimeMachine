
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    let haUrl: string;
    let haToken: string;
    const body = await request.json();
    const { service } = body;

    if (process.env.HA_URL && process.env.HA_TOKEN) {
      haUrl = process.env.HA_URL;
      haToken = process.env.HA_TOKEN;
    } else {
      haUrl = body.haUrl;
      haToken = body.haToken;
    }

    if (!haUrl || !haToken || !service) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const response = await fetch(`${haUrl}/api/services/${service.replace('.', '/')}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${haToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `Failed to reload Home Assistant: ${errorText}` }, { status: response.status });
    }

    return NextResponse.json({ message: 'Home Assistant reloaded successfully' });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
