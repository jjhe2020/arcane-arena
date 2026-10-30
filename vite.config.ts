import { defineConfig } from 'vitest/config';
export default defineConfig({
  test:{include:['tests/**/*.test.ts','src/**/*.test.ts']},
  build:{rollupOptions:{output:{manualChunks:{three:['three']}}}},
  server:{host:'0.0.0.0',port:5173,strictPort:true}
});
