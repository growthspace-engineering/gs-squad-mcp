const fs = require('fs');
const path = require('path');

// Determine the base directory - works in both local and CI environments
let baseDir = '';
const scriptPath = __dirname;

// Check if we're in the cursor-shared-history/scripts directory
if (scriptPath.endsWith('cursor-shared-history/scripts') || scriptPath.endsWith('cursor-shared-history\\scripts')) {
  // We're running from within the cursor-shared-history directory
  baseDir = path.join(scriptPath, '..');
} else {
  // We're likely running from the repository root in CI
  baseDir = path.resolve('cursor-shared-history');
}

// Path to chats directory
const chatsDir = path.join(baseDir, 'chats');
const outputPath = path.join(baseDir, 'chats.json');

console.log(`Base directory: ${ baseDir }`);
console.log(`Looking for chats in: ${ chatsDir }`);
console.log(`Output path: ${ outputPath }`);

// Check if chats directory exists
if (!fs.existsSync(chatsDir)) {
  console.error(`Chats directory not found at ${ chatsDir }!`);
  process.exit(1);
}

// Get all markdown files
const files = fs.readdirSync(chatsDir)
  .filter((file) => file.toLowerCase().endsWith('.md'))
  .map((file) => {
    // Read the first few lines to try to extract a title
    let title = '';
    try {
      const content = fs.readFileSync(path.join(chatsDir, file), 'utf8');
      // Scan more header lines to be safe with longer metadata blocks
      const lines = content.split('\n').slice(0, 100);

      // Find the first H1 anywhere in the scanned lines
      const h1Index = lines.findIndex((line) => /^\s*#\s+/.test(line));
      if (h1Index !== -1) {
        // Extract title text from H1 and trim
        title = lines[h1Index].replace(/^\s*#\s+/, '').trim();
      } else {
        // Use filename without extension as fallback; strip leading underscores
        title = file
          .replace(/\.md$/i, '')
          .replace(/^_+/, '')
          .replace(/_/g, ' ');
      }
    } catch (err) {
      console.error(`Error reading file ${ file }:`, err);
      title = file.replace(/\.md$/i, '').replace(/^_+/, '').replace(/_/g, ' ');
    }

    return {
      name: title,
      path: `chats/${ file }`
    };
  });

// Sort files alphabetically by name
files.sort((a, b) => a.name.localeCompare(b.name));

// Write to chats.json
fs.writeFileSync(outputPath, JSON.stringify(files, null, 2));

console.log(`Generated chats.json with ${ files.length } entries.`);
console.log(`Output written to: ${ outputPath }`);
