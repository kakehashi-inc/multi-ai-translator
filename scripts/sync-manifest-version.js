import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const packageJsonPath = path.join(projectRoot, 'package.json');
const manifestTargets = {
  chrome: path.join(projectRoot, 'manifest.json'),
  firefox: path.join(projectRoot, 'manifest.firefox.json')
};

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    console.error(`Failed to read JSON from ${filePath}: ${error.message}`);
    process.exit(1);
  }
}

function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  } catch (error) {
    console.error(`Failed to write JSON to ${filePath}: ${error.message}`);
    process.exit(1);
  }
}

function parseTargets(args) {
  if (!args.length) {
    return Object.keys(manifestTargets);
  }

  const normalized = new Set();

  args.forEach((arg) => {
    const value = arg.startsWith('--target=') ? arg.split('=')[1] : arg;
    const lowerValue = value.toLowerCase();

    if (lowerValue === 'all') {
      normalized.add('chrome');
      normalized.add('firefox');
      return;
    }

    if (!manifestTargets[lowerValue]) {
      console.error(`Unknown target "${value}". Use chrome, firefox, or all.`);
      process.exit(1);
    }

    normalized.add(lowerValue);
  });

  return Array.from(normalized);
}

const packageJson = readJson(packageJsonPath);
const packageVersion = packageJson.version;

if (!packageVersion) {
  console.error('package.json is missing a version field.');
  process.exit(1);
}

const targets = parseTargets(process.argv.slice(2));

targets.forEach((target) => {
  const manifestPath = manifestTargets[target];
  const manifest = readJson(manifestPath);
  manifest.version = packageVersion;
  writeJson(manifestPath, manifest);
  console.log(
    `Synced ${path.basename(manifestPath)} (${target}) to version ${packageVersion}`
  );
});
