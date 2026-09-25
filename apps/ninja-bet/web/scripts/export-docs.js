import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const betPublicDir = path.resolve(__dirname, '../public')
const repoRootDir = path.resolve(__dirname, '../../../../')
const fintechPublicDir = path.resolve(repoRootDir, 'apps/ninja-fintech/web/public')
const docsDir = path.resolve(repoRootDir, 'docs')

console.log(`Exporting static suite to ${docsDir}...`)

if (!fs.existsSync(betPublicDir)) {
  console.error(`Error: ninja-bet public directory not found at ${betPublicDir}. Run build first.`)
  process.exit(1)
}

// Clean and recreate docs directory
if (fs.existsSync(docsDir)) {
  fs.rmSync(docsDir, { recursive: true, force: true })
}
fs.mkdirSync(docsDir, { recursive: true })

// 1. Copy ninja-bet into docs root (Sportsbook KYC Demo)
fs.cpSync(betPublicDir, docsDir, { recursive: true })
console.log(`Exported ninja-bet to ${docsDir}`)

// 2. Copy ninja-fintech into docs/fintech (Digital Banking KYC Demo)
if (fs.existsSync(fintechPublicDir)) {
  const fintechDocsDir = path.join(docsDir, 'fintech')
  fs.mkdirSync(fintechDocsDir, { recursive: true })
  fs.cpSync(fintechPublicDir, fintechDocsDir, { recursive: true })
  console.log(`Exported ninja-fintech to ${fintechDocsDir}`)
}

// 3. Create .nojekyll in docs to prevent GitHub Pages from ignoring files starting with underscore
fs.writeFileSync(path.join(docsDir, '.nojekyll'), '')

console.log(`Successfully exported both applications to ${docsDir} with .nojekyll for GitHub Pages!`)
