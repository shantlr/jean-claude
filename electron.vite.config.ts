import { execSync } from 'child_process';
import { resolve } from 'path';

import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import svgr from 'vite-plugin-svgr';

const commitHash = execSync('git rev-parse --short HEAD', {
  encoding: 'utf8',
}).trim();

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
