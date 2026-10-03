import typescript from '@rollup/plugin-typescript'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import copy from 'rollup-plugin-copy'
import commonjs from '@rollup/plugin-commonjs'
import { glob } from 'glob'

const betInputs = glob.sync('./src/*.ts')

const configs = [
  // Sportsbook build (ninja-bet)
  {
    input: betInputs,
    output: {
      dir: 'public/assets/js',
      format: 'esm',
      sourcemap: false,
      preserveModules: true,
      preserveModulesRoot: 'src',
      // Write bundled packages to vendor/ instead of node_modules/: hosts like
      // Vercel skip node_modules folders, which would break the deployed site.
      entryFileNames: (chunk) => `${chunk.name.replace(/^(.*\/)?node_modules\//, 'vendor/')}.js`,
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

export default configs
