import path from 'node:path'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:3000'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    server: {
      host: '0.0.0.0',
      port: 8081,
      strictPort: true,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true
        },
        // `/project/:id/*` 同时也是 React 页面路由，只把其中的 API 请求交给后端。
        '^/project/[^/]+/api(?:/|$)': {
          target: proxyTarget,
          changeOrigin: true
        }
      }
    },
    preview: {
      port: 8081,
      strictPort: true
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router')) return 'react'
            if (id.includes('/echarts/') || id.includes('/zrender/')) return 'echarts'
            return undefined
          }
        }
      }
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html']
      }
    }
  }
})
