import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { glob } from 'glob'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const srcDir = path.resolve(rootDir, 'src')
const publicDir = path.resolve(rootDir, 'public')

/**
 * Recursively resolves HAM partials (<embed type="ham/partial" src="..." />)
 */
function resolvePartials(html, baseDir, depth = 0) {
  if (depth > 10) return html
  const partialRegex = /<embed\s+[^>]*?type=["']ham\/partial["'][^>]*?src=["']([^"']+)["'][^>]*?\/?>|<embed\s+[^>]*?src=["']([^"']+)["'][^>]*?type=["']ham\/partial["'][^>]*?\/?>/gi
  return html.replace(partialRegex, (match, p1, p2) => {
    const relSrc = p1 || p2
    const partialPath = path.resolve(baseDir, relSrc)
    if (!fs.existsSync(partialPath)) {
      console.warn(`  [ham] Warning: Partial not found: ${partialPath}`)
      return `<!-- Missing partial: ${relSrc} -->`
    }
    const partialContent = fs.readFileSync(partialPath, 'utf-8')
    return resolvePartials(partialContent, path.dirname(partialPath), depth + 1)
  })
}

/**
 * Pure Node.js compiler for HAM templates.
 * Replaces external binary `ham build` so the build succeeds in any environment (Vercel, CI/CD, Docker, etc.)
 */
function compileHamPages() {
  console.log('==> Step 1: Compiling HTML with native Node.js HAM compiler...')
  const htmlFiles = glob.sync('src/**/*.html', { cwd: rootDir })
  console.log(`  Found ${htmlFiles.length} HTML files to compile`)

  for (const relPath of htmlFiles) {
    const srcHtmlPath = path.resolve(rootDir, relPath)
    const content = fs.readFileSync(srcHtmlPath, 'utf-8')
    const pageDir = path.dirname(srcHtmlPath)
    const baseName = path.basename(srcHtmlPath, '.html')

    const outRelPath = path.relative(srcDir, srcHtmlPath)
    const destPath = path.resolve(publicDir, outRelPath)
    fs.mkdirSync(path.dirname(destPath), { recursive: true })

    const configMatch = content.match(/data-ham-page-config=(['"])([\s\S]*?)\1/)
    if (!configMatch) {
      // Standalone HTML file (e.g. src/play/index.html)
      fs.writeFileSync(destPath, content, 'utf-8')
      console.log(`  Copied standalone: ${outRelPath}`)
      continue
    }

    let layoutName = 'default.lhtml'
    try {
      const parsed = JSON.parse(configMatch[2])
      if (parsed.layout) layoutName = parsed.layout
    } catch (e) {
      console.warn(`  Failed to parse config in ${relPath}:`, e)
    }

    const layoutPath = path.resolve(pageDir, layoutName)
    if (!fs.existsSync(layoutPath)) {
      console.error(`  Layout not found: ${layoutPath}`)
      continue
    }

    let layoutContent = fs.readFileSync(layoutPath, 'utf-8')

    // Clean page content by stripping the data-ham-page-config attribute
    const cleanPageContent = content.replace(/[\r\n\s]*data-ham-page-config=(['"])[\s\S]*?\1/, '')

    // 1. Replace <embed type="ham/page"/>
    layoutContent = layoutContent.replace(/<embed\s+[^>]*?type=["']ham\/page["'][^>]*?\/?>/gi, () => cleanPageContent)

    // 2. Replace <link type="ham/layout-css"/>
    const cssFile = path.resolve(pageDir, `${baseName}.css`)
    const cssTag = fs.existsSync(cssFile) ? `\n<link rel="stylesheet" href="./assets/css/${baseName}.css"/>` : ''
    layoutContent = layoutContent.replace(/<link\s+[^>]*?type=["']ham\/layout-css["'][^>]*?\/?>/gi, cssTag)

    // 3. Replace <embed type="ham/layout-js"/>
    const tsFile = path.resolve(pageDir, `${baseName}.ts`)
    const jsFile = path.resolve(pageDir, `${baseName}.js`)
    const jsTag = (fs.existsSync(tsFile) || fs.existsSync(jsFile)) ? `\n<script type="module" src="./assets/js/${baseName}.js"></script>` : ''
    layoutContent = layoutContent.replace(/<embed\s+[^>]*?type=["']ham\/layout-js["'][^>]*?\/?>/gi, jsTag)

    // 4. Resolve partials recursively
    layoutContent = resolvePartials(layoutContent, pageDir)

    fs.writeFileSync(destPath, layoutContent, 'utf-8')
    console.log(`  Compiled: ${outRelPath}`)
  }
}

// Execute compilation
compileHamPages()

console.log('==> Step 2: Bundling TypeScript & Assets with Rollup...')
execSync('npx rollup -c', { cwd: rootDir, stdio: 'inherit' })

// Ensure images from src/assets/images are present in public/assets/images
const srcImagesDir = path.resolve(srcDir, 'assets/images')
const publicImagesDir = path.resolve(publicDir, 'assets/images')
if (fs.existsSync(srcImagesDir)) {
  fs.mkdirSync(publicImagesDir, { recursive: true })
  fs.cpSync(srcImagesDir, publicImagesDir, { recursive: true })
}

console.log('==> Step 3: Making asset URLs fully relative for static hosting...')
// Process root HTML files
const rootHtmlFiles = glob.sync('public/*.html', { cwd: rootDir })
for (const relPath of rootHtmlFiles) {
  const filePath = path.resolve(rootDir, relPath)
  let content = fs.readFileSync(filePath, 'utf-8')
  content = content.replace(/href=["']\/assets\//g, 'href="./assets/')
  content = content.replace(/src=["']\/assets\//g, 'src="./assets/')
  fs.writeFileSync(filePath, content, 'utf-8')
}

// Process play HTML files
const playHtmlFiles = glob.sync('public/play/**/*.html', { cwd: rootDir })
for (const relPath of playHtmlFiles) {
  const filePath = path.resolve(rootDir, relPath)
  let content = fs.readFileSync(filePath, 'utf-8')
  content = content.replace(/href=["']\/assets\//g, 'href="../assets/')
  content = content.replace(/src=["']\/assets\//g, 'src="../assets/')
  fs.writeFileSync(filePath, content, 'utf-8')
}

// Process fintech HTML files
const fintechHtmlFiles = glob.sync('public/fintech/**/*.html', { cwd: rootDir })
for (const relPath of fintechHtmlFiles) {
  const filePath = path.resolve(rootDir, relPath)
  let content = fs.readFileSync(filePath, 'utf-8')
  // Map fintech-specific asset tags to the fintech assets folder
  content = content.replace(/href=["']\/assets\/css\/fintech\//g, 'href="./assets/css/')
  content = content.replace(/src=["']\/assets\/js\/fintech\//g, 'src="./assets/js/')
  content = content.replace(/href=["']\/assets\//g, 'href="./assets/')
  content = content.replace(/src=["']\/assets\//g, 'src="./assets/')
  fs.writeFileSync(filePath, content, 'utf-8')
}

console.log('==> Step 4: Exporting static build directly to repository root...')
// 1. Copy root HTML files to repository root
for (const relPath of rootHtmlFiles) {
  const fileName = path.basename(relPath)
  fs.copyFileSync(path.resolve(rootDir, relPath), path.resolve(rootDir, fileName))
  console.log(`  Exported ./${fileName}`)
}

// 2. Copy play/
if (fs.existsSync(path.resolve(publicDir, 'play'))) {
  fs.cpSync(path.resolve(publicDir, 'play'), path.resolve(rootDir, 'play'), { recursive: true })
  console.log('  Exported ./play/')
}

// 3. Copy assets/
if (fs.existsSync(path.resolve(publicDir, 'assets'))) {
  fs.cpSync(path.resolve(publicDir, 'assets'), path.resolve(rootDir, 'assets'), { recursive: true })
  console.log('  Exported ./assets/')
}

// 4. Copy fintech/
if (fs.existsSync(path.resolve(publicDir, 'fintech'))) {
  fs.cpSync(path.resolve(publicDir, 'fintech'), path.resolve(rootDir, 'fintech'), { recursive: true })
  console.log('  Exported ./fintech/')
}

// 5. Copy CNAME if present
const cnamePath = path.resolve(rootDir, 'CNAME')
if (fs.existsSync(cnamePath)) {
  fs.copyFileSync(cnamePath, path.resolve(publicDir, 'CNAME'))
  console.log('  Copied CNAME to public/CNAME')
}

// 6. Create .nojekyll in root and in public
fs.writeFileSync(path.resolve(rootDir, '.nojekyll'), '')
fs.writeFileSync(path.resolve(publicDir, '.nojekyll'), '')
console.log('  Created .nojekyll')

console.log('==> Build complete! Output ready in public/ (for Vercel) and repository root.')
