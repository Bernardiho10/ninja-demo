import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const publicDir = path.resolve(__dirname, '../public')
const repoRootDir = path.resolve(__dirname, '../../../../')
const docsDir = path.resolve(repoRootDir, 'docs')

console.log(`Exporting static SPA from ${publicDir} to ${docsDir}...`)

if (!fs.existsSync(publicDir)) {
  console.error(`Error: public directory not found at ${publicDir}. Run build first.`)
  process.exit(1)
}

// Clean and recreate docs directory
if (fs.existsSync(docsDir)) {
  fs.rmSync(docsDir, { recursive: true, force: true })
}
fs.mkdirSync(docsDir, { recursive: true })

// Copy all public files into docs
fs.cpSync(publicDir, docsDir, { recursive: true })

// Also create .nojekyll in docs to prevent GitHub Pages from ignoring files
fs.writeFileSync(path.join(docsDir, '.nojekyll'), '')

console.log(`Successfully exported static SPA to ${docsDir} with .nojekyll for GitHub Pages!`)
