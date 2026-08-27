import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

const buildOutputDirectory = path.resolve(import.meta.dirname, 'dist/public');

async function listFiles(directory: string, relativeTo = directory): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(absolutePath, relativeTo);
    return path.relative(relativeTo, absolutePath).split(path.sep).join('/');
  }));
  return files.flat();
}

function injectPwaPrecacheManifest(): Plugin {
  return {
    name: 'rightsly-pwa-precache',
    apply: 'build',
    async closeBundle() {
      const workerPath = path.join(buildOutputDirectory, 'sw.js');
      const files = (await listFiles(buildOutputDirectory))
        .filter((file) => file !== 'sw.js')
        .sort();
      const hash = createHash('sha256');

      for (const file of files) {
        hash.update(file);
        hash.update(await readFile(path.join(buildOutputDirectory, file)));
      }

      const buildId = hash.digest('hex').slice(0, 12);
      const worker = await readFile(workerPath, 'utf8');
      const injected = worker
        .replace('__RIGHTSLY_BUILD_ID__', buildId)
        .replace('/*__RIGHTSLY_PRECACHE__*/[]', JSON.stringify(files));

      if (injected === worker) {
        throw new Error('Failed to inject the Rightsly service-worker precache manifest.');
      }
      await writeFile(workerPath, injected);
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    injectPwaPrecacheManifest(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: buildOutputDirectory,
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
