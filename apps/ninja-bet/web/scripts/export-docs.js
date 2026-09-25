import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const betPublicDir = path.resolve(__dirname, '../public')
const repoRootDir = path.resolve(__dirname, '../../../../')
const fintechPublicDir = path.resolve(repoRootDir, 'apps/ninja-fintech/web/public')
const rootPublicDir = path.resolve(repoRootDir, 'public')

console.log(`Exporting static suite to ${rootPublicDir}...`)

if (!fs.existsSync(betPublicDir)) {
  console.error(`Error: ninja-bet public directory not found at ${betPublicDir}. Run build first.`)
  process.exit(1)
}

function exportTo(targetDir) {
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true })
  }
  fs.mkdirSync(targetDir, { recursive: true })

  // 1. Copy ninja-bet into target root (Sportsbook KYC Demo)
  fs.cpSync(betPublicDir, targetDir, { recursive: true })
  console.log(`Exported ninja-bet to ${targetDir}`)

  // 2. Copy ninja-fintech into target/fintech (Digital Banking KYC Demo)
  if (fs.existsSync(fintechPublicDir)) {
    const fintechDir = path.join(targetDir, 'fintech')
    fs.mkdirSync(fintechDir, { recursive: true })
    fs.cpSync(fintechPublicDir, fintechDir, { recursive: true })
    console.log(`Exported ninja-fintech to ${fintechDir}`)
  }

  // 3. Create .nojekyll to prevent GitHub Pages from ignoring files starting with underscore
  fs.writeFileSync(path.join(targetDir, '.nojekyll'), '')
}

exportTo(rootPublicDir)

console.log(`Successfully exported both applications to public/ with .nojekyll!`)
