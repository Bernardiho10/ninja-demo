import typescript from '@rollup/plugin-typescript'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import copy from 'rollup-plugin-copy'
import commonjs from '@rollup/plugin-commonjs'
import { glob } from 'glob'
import fs from 'fs'
import path from 'path'

const inputFiles = glob.sync('./src/*.ts')

function makeAssetsRelative() {
  return {
    name: 'make-assets-relative',
    closeBundle() {
      const htmlFiles = glob.sync('public/**/*.html')
      for (const file of htmlFiles) {
        let content = fs.readFileSync(file, 'utf-8')
        const relDir = path.relative(path.dirname(file), 'public/assets').replace(/\\/g, '/')
        const relPrefix = relDir.startsWith('.') ? relDir : './' + relDir
        content = content.replace(/href=["']\/assets\//g, `href="${relPrefix}/`)
        content = content.replace(/src=["']\/assets\//g, `src="${relPrefix}/`)
        fs.writeFileSync(file, content, 'utf-8')
      }
    }
  }
}

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
    makeAssetsRelative(),
  ],
}
