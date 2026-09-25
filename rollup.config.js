import typescript from '@rollup/plugin-typescript'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import copy from 'rollup-plugin-copy'
import commonjs from '@rollup/plugin-commonjs'
import { glob } from 'glob'

const betInputs = glob.sync('./src/*.ts')
const fintechInputs = glob.sync('./src/fintech/*.ts')

export default [
  // 1. Sportsbook build
  {
    input: betInputs,
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
          { src: 'src/*.css', dest: 'public/assets/css' },
          { src: 'src/assets/**/*', dest: 'public/assets' },
        ],
        flatten: false,
      }),
      typescript({ tsconfig: './tsconfig.json' }),
      nodeResolve(),
      commonjs(),
    ],
  },
  // 2. Fintech build
  {
    input: fintechInputs,
    output: {
      dir: 'public/fintech/assets/js',
      format: 'esm',
      sourcemap: false,
      preserveModules: true,
      preserveModulesRoot: 'src/fintech',
    },
    plugins: [
      copy({
        targets: [
          { src: 'src/fintech/*.css', dest: 'public/fintech/assets/css' },
        ],
        flatten: false,
      }),
      typescript({ tsconfig: './tsconfig.json' }),
      nodeResolve(),
      commonjs(),
    ],
  },
]
