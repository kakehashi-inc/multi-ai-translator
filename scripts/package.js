/**
 * Package extension for distribution
 * Creates ZIP files for Chrome/Edge and Firefox
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..');
const distDirChrome = path.join(projectRoot, 'dist');
const distDirFirefox = path.join(projectRoot, 'dist-firefox');
const outputDir = path.join(projectRoot, 'packages');
const manifestChromePath = path.join(projectRoot, 'manifest.json');
const manifestFirefoxPath = path.join(projectRoot, 'manifest.firefox.json');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Check if dist directory exists
if (!fs.existsSync(distDirChrome)) {
  console.error('Error: dist directory not found. Run "yarn build:chrome" first.');
  process.exit(1);
}

if (!fs.existsSync(distDirFirefox)) {
  console.error('Error: dist-firefox directory not found. Run "yarn build:firefox" first.');
  process.exit(1);
}

function readManifestVersion(manifestPath) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    if (!manifest.version) {
      throw new Error('version field is missing');
    }

    return manifest.version;
  } catch (error) {
    console.error(`Error reading manifest version from ${manifestPath}: ${error.message}`);
    process.exit(1);
  }
}

function sanitizeVersionForFilename(version) {
  return version.replace(/[<>:"/\\|?*]/g, '-');
}

function getOutputFileName(baseName, version) {
  const safeVersion = sanitizeVersionForFilename(version);
  return `${baseName}-${safeVersion}.zip`;
}

/**
 * Create a ZIP package
 */
function createPackage({ name, version, sourceDir, description }) {
  const fileName = getOutputFileName(name, version);
  const outputFile = path.join(outputDir, fileName);

  // Remove existing zip file
  if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile);
  }

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputFile);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    output.on('close', () => {
      const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`✓ ${description}: ${fileName} (${sizeInMB} MB)`);
      resolve(fileName);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add dist directory contents
    archive.directory(sourceDir, false);

    archive.finalize();
  });
}

const chromeVersion = readManifestVersion(manifestChromePath);
const firefoxVersion = readManifestVersion(manifestFirefoxPath);

// Create packages
console.log('\nCreating multi-browser packages...\n');

Promise.all([
  createPackage({
    name: 'multi-ai-translator-chrome',
    version: chromeVersion,
    sourceDir: distDirChrome,
    description: 'Chrome/Edge package'
  }),
  createPackage({
    name: 'multi-ai-translator-firefox',
    version: firefoxVersion,
    sourceDir: distDirFirefox,
    description: 'Firefox package'
  })
])
  .then(() => {
    console.log('\n✓ All packages created successfully!');
    console.log('\nPackages:');
    console.log(
      `  - ${getOutputFileName('multi-ai-translator-chrome', chromeVersion)} (for Chrome and Edge)`
    );
    console.log(
      `  - ${getOutputFileName('multi-ai-translator-firefox', firefoxVersion)} (for Firefox)`
    );
  })
  .catch((err) => {
    console.error('Error creating packages:', err);
    process.exit(1);
  });
