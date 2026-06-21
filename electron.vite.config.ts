import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { execSync } from 'child_process';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import svgr from 'vite-plugin-svgr';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';


const commitHash = execSync('git rev-parse --short HEAD', {
  encoding: 'utf8',
}).trim();

function getDevServerPort(): number | undefined {
  const value = process.env.JC_DEV_SERVER_PORT;
  if (!value) return undefined;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('JC_DEV_SERVER_PORT must be an integer from 1 to 65535');
  }

  return port;
}

const devServerPort = getDevServerPort();

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve('shared'),
      },
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main.ts'),
          'jean-claude-mcp-server': resolve(
            __dirname,
            'electron/mcp/jean-claude-mcp-server.ts',
          ),
        },
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve('shared'),
      },
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload.ts'),
        },
      },
    },
  },
  renderer: {
    root: '.',
    server: {
      port: devServerPort,
      strictPort: !!devServerPort,
    },
    define: {
      'import.meta.env.VITE_COMMIT_HASH': JSON.stringify(commitHash),
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve('src'),
        '@shared': resolve('shared'),
      },
    },
    plugins: [
      tanstackRouter({
        routesDirectory: 'src/routes',
        generatedRouteTree: 'src/routeTree.gen.ts',
      }) as any,
      svgr(),
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler', {}]],
        },
      }),
      tailwindcss(),
    ],
  },
});
