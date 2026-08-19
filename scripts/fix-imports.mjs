import fs from 'fs';
import path from 'path';

const srcDir = '/Users/zero/Projects/backend-vour-carousels/src';

function walk(dir) {
  let files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.mjs')) {
      fixFile(fullPath);
    }
  }
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let hasChange = false;

  // Regex to find import or export statements with @/lib/
  const regex = /(from\s+["']|import\s+["']|import\(["'])@\/lib\/([^"']*)(["'])/g;

  content = content.replace(regex, (match, prefix, suffix, quote) => {
    hasChange = true;
    // Compute relative path from filePath to src/lib/suffix
    const relativeDir = path.relative(path.dirname(filePath), path.join(srcDir, 'lib'));
    let relPath = path.join(relativeDir, suffix);
    if (!relPath.startsWith('.') && !relPath.startsWith('/')) {
      relPath = './' + relPath;
    }
    // Windows path separator normalization (not needed on macOS, but safe)
    relPath = relPath.replace(/\\/g, '/');
    return `${prefix}${relPath}${quote}`;
  });

  if (hasChange) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed imports in: ${path.relative(srcDir, filePath)}`);
  }
}

walk(srcDir);
console.log('Done fixing imports.');
