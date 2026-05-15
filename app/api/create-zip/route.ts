import { NextRequest, NextResponse } from 'next/server';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';
import type { CommandResult, SandboxProvider } from '@/lib/sandbox/types';

declare global {
  var activeSandbox: any;
  var activeSandboxProvider: any;
}

async function readMaybeStream(value: unknown): Promise<string> {
  if (typeof value === 'function') {
    return String(await value());
  }

  return typeof value === 'string' ? value : '';
}

async function runLegacySandboxCommand(sandbox: any, cmd: string): Promise<CommandResult> {
  const result = await sandbox.runCommand({
    cmd: 'sh',
    args: ['-lc', cmd],
    cwd: '/vercel/sandbox',
  });

  const stdout = await readMaybeStream(result.stdout);
  const stderr = await readMaybeStream(result.stderr);
  const exitCode = result.exitCode || 0;

  return {
    stdout,
    stderr,
    exitCode,
    success: exitCode === 0,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const sandboxId = typeof body?.sandboxId === 'string' ? body.sandboxId : undefined;
    const provider = sandboxId
      ? sandboxManager.getProvider(sandboxId) || global.activeSandboxProvider
      : sandboxManager.getActiveProvider() || global.activeSandboxProvider;
    const legacySandbox = !provider ? global.activeSandbox : null;

    if (!provider && !legacySandbox) {
      return NextResponse.json({
        success: false,
        error: 'No active sandbox',
      }, { status: 400 });
    }

    const runCommand = provider
      ? (command: string) => provider.runCommand(command)
      : (command: string) => runLegacySandboxCommand(legacySandbox, command);

    console.log('[create-zip] Creating project zip...');

    const zipResult = await runCommand(
      'rm -f /tmp/project.zip && zip -r /tmp/project.zip . -x "node_modules/*" ".git/*" ".next/*" "dist/*" "build/*" "*.log"',
    );

    if (!zipResult.success) {
      throw new Error(`Failed to create zip: ${zipResult.stderr || zipResult.stdout}`);
    }

    const sizeResult = await runCommand("stat -c%s /tmp/project.zip 2>/dev/null || wc -c < /tmp/project.zip");
    const fileSize = sizeResult.stdout.trim();
    console.log(`[create-zip] Created project.zip (${fileSize || 'unknown'} bytes)`);

    const readResult = await runCommand('base64 -w 0 /tmp/project.zip 2>/dev/null || base64 /tmp/project.zip');

    if (!readResult.success) {
      throw new Error(`Failed to read zip file: ${readResult.stderr || readResult.stdout}`);
    }

    const base64Content = readResult.stdout.replace(/\s/g, '');
    const dataUrl = `data:application/zip;base64,${base64Content}`;

    return NextResponse.json({
      success: true,
      dataUrl,
      fileName: 'creative-sandbox-project.zip',
      message: 'Zip file created successfully',
    });
  } catch (error) {
    console.error('[create-zip] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
