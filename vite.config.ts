import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type ServerOptions } from 'vite'

/**
 * 手机实机测试用的本地 HTTPS（npm run dev:https）。
 * 证书由开发者用 mkcert 在本机生成，放在 .cert/（已被 .gitignore 忽略），步骤见 docs/mobile-testing.zh-CN.md。
 * 只在局域网内监听，不经过任何公网服务。
 */
function lanHttps(): ServerOptions {
  const dir = resolve(import.meta.dirname, '.cert')
  const key = resolve(dir, 'key.pem')
  const cert = resolve(dir, 'cert.pem')
  if (!existsSync(key) || !existsSync(cert)) {
    throw new Error(
      '没有找到 .cert/key.pem 和 .cert/cert.pem。请先按 docs/mobile-testing.zh-CN.md 用 mkcert 生成本地证书。\n' +
        'Missing .cert/key.pem and .cert/cert.pem. Generate them with mkcert (see docs/mobile-testing.zh-CN.md).',
    )
  }
  return {
    host: true,
    https: { key: readFileSync(key), cert: readFileSync(cert) },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => ({
  plugins: [react()],
  worker: {
    rollupOptions: {
      output: {
        banner: '/*! Includes gifenc 1.0.3 (MIT) and its PNN quantizer (MPL-2.0). Corresponding source: ../vendor/gifenc-1.0.3/src/pnnquant2.js ; licenses and notices: ../third-party-licenses.txt */',
      },
    },
  },
  server: command === 'serve' && mode === 'https' ? lanHttps() : undefined,
}))
