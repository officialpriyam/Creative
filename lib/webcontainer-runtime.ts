'use client';

import type {
  FileSystemTree,
  WebContainer,
  WebContainerProcess,
} from '@webcontainer/api';

type ProgressHandler = (message: string) => void;

export interface WebContainerSandboxData {
  sandboxId: string;
  url: string;
  provider: 'webcontainer';
  local: true;
}

export interface ParsedGeneratedCode {
  files: Array<{ path: string; content: string }>;
  packages: string[];
  explanation: string;
  structure: string | null;
}

export interface WebContainerApplyResult {
  success: true;
  results: {
    filesCreated: string[];
    filesUpdated: string[];
    packagesInstalled: string[];
    packagesAlreadyInstalled: string[];
    packagesFailed: string[];
    commandsExecuted: string[];
    errors: string[];
  };
  explanation: string;
  structure: string | null;
  message: string;
}

type RuntimeState = {
  webcontainer: WebContainer;
  devProcess: WebContainerProcess | null;
  previewUrl: string | null;
  serverReadyResolver: ((url: string) => void) | null;
  installedPackages: Set<string>;
  files: Set<string>;
};

let runtimePromise: Promise<RuntimeState> | null = null;
let runtimeState: RuntimeState | null = null;

const baseDependencies = new Set([
  'react',
  'react-dom',
  '@vitejs/plugin-react',
  'vite',
  'tailwindcss',
  'postcss',
  'autoprefixer',
]);

const ignoredPackageNames = new Set([
  'react',
  'react-dom',
  'react-dom/client',
  'vite',
]);

const blockedGeneratedConfigFiles = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'vite.config.js',
  'vite.config.ts',
  'tailwind.config.js',
  'tailwind.config.ts',
  'postcss.config.js',
  'postcss.config.mjs',
  'tsconfig.json',
]);

function ensureBrowserRuntime() {
  if (typeof window === 'undefined') {
    throw new Error('WebContainer can only run in the browser.');
  }

  if (!window.crossOriginIsolated) {
    throw new Error(
      'WebContainer needs cross-origin isolation. Restart the Next dev server so the COOP/COEP headers from next.config.ts are active, then open the app in a Chromium-based browser.',
    );
  }
}

function file(contents: string): { file: { contents: string } } {
  return { file: { contents } };
}

function baseProjectFiles(): FileSystemTree {
  return {
    'package.json': file(JSON.stringify({
      name: 'creative-webcontainer-app',
      version: '1.0.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite --host 0.0.0.0',
        build: 'vite build',
        preview: 'vite preview --host 0.0.0.0',
      },
      dependencies: {
        '@vitejs/plugin-react': '^4.3.4',
        autoprefixer: '^10.4.21',
        postcss: '^8.5.6',
        react: '^18.3.1',
        'react-dom': '^18.3.1',
        tailwindcss: '^3.4.17',
        vite: '^5.4.21',
      },
      devDependencies: {},
    }, null, 2)),
    'index.html': file(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Creative Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`),
    'vite.config.js': file(`import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    hmr: false,
  },
});
`),
    'tailwind.config.js': file(`/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
`),
    'postcss.config.js': file(`export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`),
    src: {
      directory: {
        'main.jsx': file(`import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`),
        'App.jsx': file(`export default function App() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="max-w-xl text-center">
        <p className="text-lg text-zinc-300">
          WebContainer is ready. Generate an app to replace this preview.
        </p>
      </div>
    </main>
  );
}
`),
        'index.css': file(`@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
`),
      },
    },
  };
}

function normalizeGeneratedPath(path: string): string {
  let normalized = path.replace(/\\/g, '/').replace(/^\/+/, '').trim();

  if (!normalized) {
    normalized = 'src/App.jsx';
  }

  const fileName = normalized.split('/').pop() || normalized;
  if (
    !normalized.startsWith('src/') &&
    !normalized.startsWith('public/') &&
    normalized !== 'index.html' &&
    !blockedGeneratedConfigFiles.has(fileName)
  ) {
    normalized = `src/${normalized}`;
  }

  return normalized;
}

function packageNameFromImport(importPath: string): string | null {
  if (
    !importPath ||
    importPath.startsWith('.') ||
    importPath.startsWith('/') ||
    importPath.startsWith('@/') ||
    ignoredPackageNames.has(importPath)
  ) {
    return null;
  }

  return importPath.startsWith('@')
    ? importPath.split('/').slice(0, 2).join('/')
    : importPath.split('/')[0];
}

function extractPackagesFromCode(content: string): string[] {
  const packages = new Set<string>();
  const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportRegex = /import\(['"]([^'"]+)['"]\)/g;
  const requireRegex = /require\(['"]([^'"]+)['"]\)/g;

  for (const regex of [importRegex, dynamicImportRegex, requireRegex]) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const packageName = packageNameFromImport(match[1]);
      if (packageName) {
        packages.add(packageName);
      }
    }
  }

  return [...packages];
}

export function parseGeneratedCode(response: string): ParsedGeneratedCode {
  const files = new Map<string, string>();
  const packages = new Set<string>();

  const fileRegex = /<file path="([^"]+)">([\s\S]*?)(?:<\/file>|$)/g;
  let match;
  while ((match = fileRegex.exec(response)) !== null) {
    const path = normalizeGeneratedPath(match[1]);
    const fileName = path.split('/').pop() || path;
    if (blockedGeneratedConfigFiles.has(fileName)) {
      continue;
    }

    const content = match[2].trim();
    if (!content) {
      continue;
    }

    const previous = files.get(path);
    if (!previous || content.length > previous.length) {
      files.set(path, content);
    }
  }

  const markdownFileRegex = /```(?:file\s+)?path="([^"]+)"\n([\s\S]*?)```/g;
  while ((match = markdownFileRegex.exec(response)) !== null) {
    const path = normalizeGeneratedPath(match[1]);
    const fileName = path.split('/').pop() || path;
    if (!blockedGeneratedConfigFiles.has(fileName)) {
      files.set(path, match[2].trim());
    }
  }

  for (const content of files.values()) {
    for (const packageName of extractPackagesFromCode(content)) {
      packages.add(packageName);
    }
  }

  const packageRegex = /<package>(.*?)<\/package>/g;
  while ((match = packageRegex.exec(response)) !== null) {
    const packageName = match[1].trim();
    if (packageName) {
      packages.add(packageName);
    }
  }

  const packagesMatch = response.match(/<packages>([\s\S]*?)<\/packages>/);
  if (packagesMatch) {
    packagesMatch[1]
      .split(/[\n,]+/)
      .map((packageName) => packageName.trim())
      .filter(Boolean)
      .forEach((packageName) => packages.add(packageName));
  }

  const explanation = response.match(/<explanation>([\s\S]*?)<\/explanation>/)?.[1]?.trim() || '';
  const structure = response.match(/<structure>([\s\S]*?)<\/structure>/)?.[1]?.trim() || null;

  return {
    files: [...files.entries()].map(([path, content]) => ({ path, content })),
    packages: [...packages].filter((packageName) => !baseDependencies.has(packageName)),
    explanation,
    structure,
  };
}

async function consumeOutput(process: WebContainerProcess, onOutput?: ProgressHandler) {
  const reader = process.output.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (value && onOutput) {
        onOutput(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function runProcess(
  webcontainer: WebContainer,
  command: string,
  args: string[],
  onOutput?: ProgressHandler,
) {
  const process = await webcontainer.spawn(command, args);
  const outputPromise = consumeOutput(process, onOutput).catch(() => undefined);
  const exitCode = await process.exit;
  await outputPromise;

  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${exitCode}`);
  }
}

async function waitForServerReady(state: RuntimeState, timeoutMs = 60000): Promise<string> {
  if (state.previewUrl) {
    return state.previewUrl;
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      state.serverReadyResolver = null;
      reject(new Error('Timed out waiting for WebContainer preview server.'));
    }, timeoutMs);

    state.serverReadyResolver = (url) => {
      window.clearTimeout(timeout);
      state.serverReadyResolver = null;
      resolve(url);
    };
  });
}

async function getRuntime(onStatus?: ProgressHandler): Promise<RuntimeState> {
  ensureBrowserRuntime();

  if (runtimeState) {
    return runtimeState;
  }

  if (!runtimePromise) {
    runtimePromise = (async () => {
      onStatus?.('Booting StackBlitz WebContainer...');
      const { WebContainer } = await import('@webcontainer/api');
      const webcontainer = await WebContainer.boot({
        coep: 'credentialless',
        workdirName: 'creative',
        forwardPreviewErrors: 'exceptions-only',
      });

      const state: RuntimeState = {
        webcontainer,
        devProcess: null,
        previewUrl: null,
        serverReadyResolver: null,
        installedPackages: new Set(baseDependencies),
        files: new Set(),
      };

      webcontainer.on('server-ready', (_port, url) => {
        state.previewUrl = url;
        state.serverReadyResolver?.(url);
      });

      webcontainer.on('error', (error) => {
        console.error('[webcontainer] runtime error:', error);
      });

      runtimeState = state;
      return state;
    })();
  }

  return runtimePromise;
}

async function resetProject(state: RuntimeState) {
  state.devProcess?.kill();
  state.devProcess = null;
  state.previewUrl = null;
  state.files.clear();
  state.installedPackages = new Set(baseDependencies);

  await Promise.allSettled([
    state.webcontainer.fs.rm('/src', { recursive: true, force: true }),
    state.webcontainer.fs.rm('/public', { recursive: true, force: true }),
    state.webcontainer.fs.rm('/index.html', { force: true }),
    state.webcontainer.fs.rm('/package.json', { force: true }),
    state.webcontainer.fs.rm('/package-lock.json', { force: true }),
    state.webcontainer.fs.rm('/vite.config.js', { force: true }),
    state.webcontainer.fs.rm('/tailwind.config.js', { force: true }),
    state.webcontainer.fs.rm('/postcss.config.js', { force: true }),
  ]);

  await state.webcontainer.mount(baseProjectFiles());
  [
    'index.html',
    'package.json',
    'vite.config.js',
    'tailwind.config.js',
    'postcss.config.js',
    'src/main.jsx',
    'src/App.jsx',
    'src/index.css',
  ].forEach((path) => state.files.add(path));
}

async function startDevServer(state: RuntimeState, onStatus?: ProgressHandler) {
  state.devProcess?.kill();
  state.previewUrl = null;
  onStatus?.('Starting Vite preview in WebContainer...');
  state.devProcess = await state.webcontainer.spawn('npm', ['run', 'dev']);
  consumeOutput(state.devProcess, (chunk) => {
    if (/error|failed/i.test(chunk)) {
      console.warn('[webcontainer:vite]', chunk);
    }
  }).catch(() => undefined);

  return waitForServerReady(state);
}

export async function createWebContainerSandbox(onStatus?: ProgressHandler): Promise<WebContainerSandboxData> {
  const state = await getRuntime(onStatus);

  onStatus?.('Mounting local Vite project...');
  await resetProject(state);

  onStatus?.('Installing dependencies in WebContainer...');
  await runProcess(state.webcontainer, 'npm', ['install', '--no-audit', '--no-fund'], onStatus);

  const url = await startDevServer(state, onStatus);

  return {
    sandboxId: 'webcontainer-local',
    url,
    provider: 'webcontainer',
    local: true,
  };
}

async function installPackages(
  state: RuntimeState,
  packages: string[],
  onStatus?: ProgressHandler,
): Promise<{ installed: string[]; alreadyInstalled: string[]; failed: string[] }> {
  const uniquePackages = [...new Set(packages)]
    .map((packageName) => packageName.trim())
    .filter(Boolean)
    .filter((packageName) => !state.installedPackages.has(packageName));

  if (uniquePackages.length === 0) {
    return { installed: [], alreadyInstalled: packages, failed: [] };
  }

  onStatus?.(`Installing ${uniquePackages.length} package${uniquePackages.length === 1 ? '' : 's'}...`);

  try {
    await runProcess(state.webcontainer, 'npm', ['install', '--no-audit', '--no-fund', ...uniquePackages], onStatus);
    uniquePackages.forEach((packageName) => state.installedPackages.add(packageName));
    return { installed: uniquePackages, alreadyInstalled: [], failed: [] };
  } catch (error) {
    console.error('[webcontainer] package install failed:', error);
    return { installed: [], alreadyInstalled: [], failed: uniquePackages };
  }
}

async function writeGeneratedFiles(state: RuntimeState, files: ParsedGeneratedCode['files']) {
  const created: string[] = [];
  const updated: string[] = [];

  for (const { path, content } of files) {
    const normalizedPath = normalizeGeneratedPath(path);
    const dir = normalizedPath.includes('/') ? normalizedPath.slice(0, normalizedPath.lastIndexOf('/')) : '';

    if (dir) {
      await state.webcontainer.fs.mkdir(`/${dir}`, { recursive: true });
    }

    const existed = state.files.has(normalizedPath);
    await state.webcontainer.fs.writeFile(`/${normalizedPath}`, content);
    state.files.add(normalizedPath);

    if (existed) {
      updated.push(normalizedPath);
    } else {
      created.push(normalizedPath);
    }
  }

  const paths = new Set([...created, ...updated, ...state.files]);
  const hasMain = [...paths].some((path) => /^src\/main\.(jsx|tsx|js|ts)$/.test(path));
  const appPath = ['src/App.jsx', 'src/App.tsx', 'src/App.js', 'src/App.ts'].find((path) => paths.has(path));

  if (!hasMain && appPath) {
    const importPath = `./${appPath.split('/').pop()}`;
    const mainPath = 'src/main.jsx';
    await state.webcontainer.fs.writeFile(`/${mainPath}`, `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '${importPath}';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`);
    state.files.add(mainPath);
    updated.push(mainPath);
  }

  return { created, updated };
}

export async function applyCodeToWebContainer(
  response: string,
  extraPackages: string[] = [],
  onStatus?: ProgressHandler,
): Promise<WebContainerApplyResult> {
  const state = await getRuntime(onStatus);
  const parsed = parseGeneratedCode(response);

  if (parsed.files.length === 0) {
    throw new Error('No generated files found to apply.');
  }

  const allPackages = [...parsed.packages, ...extraPackages];
  const packageResult = await installPackages(state, allPackages, onStatus);

  onStatus?.(`Writing ${parsed.files.length} generated file${parsed.files.length === 1 ? '' : 's'}...`);
  const fileResult = await writeGeneratedFiles(state, parsed.files);

  if (packageResult.installed.length > 0 || !state.devProcess) {
    await startDevServer(state, onStatus);
  }

  return {
    success: true,
    results: {
      filesCreated: fileResult.created,
      filesUpdated: fileResult.updated,
      packagesInstalled: packageResult.installed,
      packagesAlreadyInstalled: packageResult.alreadyInstalled,
      packagesFailed: packageResult.failed,
      commandsExecuted: [],
      errors: packageResult.failed.length > 0
        ? [`Failed to install packages: ${packageResult.failed.join(', ')}`]
        : [],
    },
    explanation: parsed.explanation,
    structure: parsed.structure,
    message: `Applied ${fileResult.created.length + fileResult.updated.length} files in WebContainer`,
  };
}

async function walkFiles(state: RuntimeState, directory: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const entries = await state.webcontainer.fs.readdir(directory, {
    encoding: 'utf-8',
    withFileTypes: true,
  });

  for (const entry of entries) {
    const childPath = `${directory === '/' ? '' : directory}/${entry.name}`;
    const relativePath = childPath.replace(/^\/+/, '');

    if (
      entry.isDirectory() &&
      !['node_modules', '.git', '.next', 'dist', 'build'].includes(String(entry.name))
    ) {
      Object.assign(files, await walkFiles(state, childPath));
    } else if (entry.isFile()) {
      try {
        files[relativePath] = await state.webcontainer.fs.readFile(childPath, 'utf-8') as string;
      } catch {
        // Binary files are ignored in the sidebar/cache.
      }
    }
  }

  return files;
}

export async function listWebContainerFiles(): Promise<{
  files: Record<string, string>;
  structure: string;
}> {
  const state = await getRuntime();
  const files = await walkFiles(state, '/');
  const structure = Object.keys(files).sort().join('\n');

  return { files, structure };
}

export async function exportWebContainerZip(): Promise<Blob> {
  const state = await getRuntime();
  const data = await state.webcontainer.export('/', {
    format: 'zip',
    excludes: [
      'node_modules/**',
      '.git/**',
      '.next/**',
      'dist/**',
      'build/**',
      '*.log',
    ],
  }) as Uint8Array;
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);

  return new Blob([buffer], { type: 'application/zip' });
}

export function isWebContainerEnabled() {
  return true;
}
