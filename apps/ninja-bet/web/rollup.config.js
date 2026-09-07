import typescript from '@rollup/plugin-typescript'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import copy from 'rollup-plugin-copy'
import commonjs from '@rollup/plugin-commonjs'
import { glob } from 'glob'

// One bundle per page entry (register.ts, play.ts, ...) plus the shared
// nav.ts that every page's layout links directly — mirrors HAM's own
// per-page .html/.css/.ts convention.
const inputFiles = glob.sync('./src/*.ts')

export default {
  input: inputFiles,
  output: {
    dir: 'public/assets/js',
    format: 'esm',
    sourcemap: false,
    preserveModules: true,
    preserveModulesRoot: 'src',
  },
  plugins: [
    copy({
      targets: [
        { src: 'src/**/*.css', dest: 'public/assets/css' },
        { src: 'src/**/*.js', dest: 'public/assets/js' },
      ],
      flatten: false,
    }),
    typescript({ tsconfig: './tsconfig.json' }),
    nodeResolve(),
    commonjs(),
  ],
}
