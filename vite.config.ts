import { defineConfig } from 'vitest/config';
import {offlineBuild} from './scripts/pwa-build';
export default defineConfig({
  plugins:[offlineBuild()],
  test:{include:['tests/**/*.test.ts','src/**/*.test.ts']},
  build:{rollupOptions:{input:{game:'index.html',skillLab:'skill-lab.html'},output:{manualChunks:{three:['three']}}}},
  server:{host:'0.0.0.0',port:5173,strictPort:true}
});
