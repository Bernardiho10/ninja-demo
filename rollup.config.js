import typescript from '@rollup/plugin-typescript'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import copy from 'rollup-plugin-copy'
import commonjs from '@rollup/plugin-commonjs'
import { glob } from 'glob'

const betInputs = glob.sync('./src/*.ts')
const fintechInputs = glob.sync('./src/fintech/*.ts')

const configs = [
  // 1. Sportsbook build (ninja-bet)
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
          { src: 'src/assets/images/*', dest: 'public/assets/images' },
        ],
        flatten: true,
      }),
      typescript({ tsconfig: './tsconfig.json' }),
      nodeResolve(),
      commonjs(),
    ],
  },
]

if (fintechInputs.length > 0) {
  configs.push({
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
        flatten: true,
      }),
      typescript({ tsconfig: './tsconfig.json' }),
      nodeResolve(),
      commonjs(),
    ],
  })
}

export default configs
