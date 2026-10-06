import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const isRelease = process.argv.includes('--release')
const gradleTask = isRelease ? 'assembleRelease' : 'assembleDebug'
const isWindows = process.platform === 'win32'
const gradlewCmd = isWindows ? 'gradlew.bat' : './gradlew'

console.log(`\n========================================`)
console.log(`🚀 Building THOGAI APK (${isRelease ? 'Release' : 'Debug'})...`)
console.log(`========================================\n`)

try {
  // Step 1: Web build
  console.log('📦 Step 1/3: Compiling web assets with Vite...')
  execSync('npm run build', { cwd: rootDir, stdio: 'inherit' })

  // Step 2: Capacitor sync
  console.log('\n📲 Step 2/3: Syncing web assets to Android platform...')
  execSync('npx cap sync android', { cwd: rootDir, stdio: 'inherit' })

  // Step 3: Gradle APK compilation
  console.log(`\n⚙️ Step 3/3: Compiling Android APK with Gradle (${gradleTask})...`)
  const androidDir = path.join(rootDir, 'android')
  execSync(`${gradlewCmd} ${gradleTask}`, { cwd: androidDir, stdio: 'inherit' })

  // Step 4: Copy APK to root dist-apk folder
  const apkSourceSubdir = isRelease ? 'release' : 'debug'
  const apkSourceName = isRelease ? 'app-release-unsigned.apk' : 'app-debug.apk'
  const sourceApkPath = path.join(androidDir, 'app', 'build', 'outputs', 'apk', apkSourceSubdir, apkSourceName)

  const outputDir = path.join(rootDir, 'dist-apk')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const outputApkName = isRelease ? 'THOGAI-release.apk' : 'THOGAI.apk'
  const targetApkPath = path.join(outputDir, outputApkName)

  if (fs.existsSync(sourceApkPath)) {
    fs.copyFileSync(sourceApkPath, targetApkPath)
    const stats = fs.statSync(targetApkPath)
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2)

    console.log(`\n========================================`)
    console.log(`✅ SUCCESS! Android APK built successfully:`)
    console.log(`   📍 Location: ${targetApkPath}`)
    console.log(`   ⚖️ Size:     ${sizeMb} MB (${stats.size.toLocaleString()} bytes)`)
    console.log(`========================================\n`)
  } else {
    console.warn(`⚠️ Warning: Expected APK at ${sourceApkPath} was not found. Check Gradle outputs.`)
  }
} catch (err) {
  console.error('\n❌ APK Build failed:', err.message)
  process.exit(1)
}
