import react from '@vitejs/plugin-react'
import { getLastCommit } from 'git-last-commit'
import jotaiDebugLabel from 'jotai/babel/plugin-debug-label'
import jotaiReactRefresh from 'jotai/babel/plugin-react-refresh'
import path from 'node:path'
import { visualizer } from 'rollup-plugin-visualizer'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite'
import type { PluginOption } from 'vite'

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  // 出错分支必须也 resolve。原来写成 `err ? 'unknown' : resolve(...)`，出错时只是求值出
  // 一个字符串、从不调用 resolve，promise 永远挂起 —— vite 会静默退出、退出码 0、
  // 不产出任何文件。配合 `make deploy` 的 rsync --delete，足以把线上站点删空。
  // 触发条件很现实：macOS 升级后没接受 Xcode 许可，git 整个不可用。
  const latestCommitHash = await new Promise<string>((resolve) => {
    getLastCommit((err, commit) => resolve(err || !commit ? 'unknown' : commit.shortHash))
  })
  return {
    plugins: [
      react({ babel: { plugins: [jotaiDebugLabel, jotaiReactRefresh] } }),
      visualizer() as PluginOption,
      Icons({
        compiler: 'jsx',
        jsx: 'react',
      }),
    ],
    build: {
      minify: true,
      outDir: 'build',
      sourcemap: false,
    },
    esbuild: {
      drop: mode === 'development' ? [] : ['console', 'debugger'],
    },
    define: {
      REACT_APP_DEPLOY_ENV: JSON.stringify(process.env.REACT_APP_DEPLOY_ENV),
      LATEST_COMMIT_HASH: JSON.stringify(latestCommitHash + (process.env.NODE_ENV === 'production' ? '' : ' (dev)')),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    css: {
      modules: {
        localsConvention: 'camelCaseOnly',
      },
    },
  }
})
