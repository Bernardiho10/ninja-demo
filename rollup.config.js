import fs from 'fs'
import path from 'path'
import typescript from '@rollup/plugin-typescript'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import copy from 'rollup-plugin-copy'
import commonjs from '@rollup/plugin-commonjs'
import { glob } from 'glob'

const betInputs = glob.sync('./src/*.ts')

function compileHtmlPlugin() {
  return {
    name: 'compile-html',
    buildStart() {
      try {
        const layoutContent = fs.readFileSync('src/default.lhtml', 'utf-8')
        const navContent = fs.readFileSync('src/nav.phtml', 'utf-8')
        let pageContent = fs.readFileSync('src/index.html', 'utf-8')
        pageContent = pageContent.replace(/[\r\n\s]*data-ham-page-config=(['"])[\s\S]*?\1/, '')

        let compiled = layoutContent
          .replace(/<link\s+type=["']ham\/layout-css["']\s*\/?>/gi, '\n<link rel="stylesheet" href="./assets/css/index.css"/>')
          .replace(/<embed\s+type=["']ham\/partial["']\s+src=["']nav\.phtml["']\s*\/?>/gi, navContent)
          .replace(/<embed\s+type=["']ham\/page["']\s*\/?>/gi, pageContent)
          .replace(/<embed\s+type=["']ham\/layout-js["']\s*\/?>/gi, '\n<script type="module" src="./assets/js/index.js"></script>')

        fs.mkdirSync('public', { recursive: true })
        fs.writeFileSync('public/index.html', compiled, 'utf-8')
        console.log('  [compile-html] Successfully compiled public/index.html')
      } catch (err) {
        console.error('  [compile-html] Failed to compile public/index.html:', err)
      }
    },
  }
}

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
    },
    plugins: [
      compileHtmlPlugin(),
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
