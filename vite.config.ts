import { defineConfig } from 'vite';

export default defineConfig({
  // 前端入口 index.html 在 frontend/ 下，将 Vite 根目录指到 frontend
  root: 'frontend',
  build: {
    // 构建产物仍输出到项目根目录的 dist/
    outDir: '../dist',
    emptyOutDir: true,
  },
});
