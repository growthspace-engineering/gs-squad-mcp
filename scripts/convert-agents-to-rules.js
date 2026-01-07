#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const agentsDir = path.join(__dirname, '..', 'agents');
const rulesDir = path.join(__dirname, '..', '.cursor', 'rules', 'roles');

// Ensure rules directory exists
if (!fs.existsSync(rulesDir)) {
  fs.mkdirSync(rulesDir, { recursive: true });
}

// Get all markdown files in agents directory
const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));

console.log(`Converting ${agentFiles.length} agent files to cursor rules...`);

for (const file of agentFiles) {
  const filePath = path.join(agentsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Check if file has YAML frontmatter
  let body = content;
  let description = '';
  let name = file.replace('.md', '');
  
  if (content.startsWith('---')) {
    // Has frontmatter - extract it
    const endIndex = content.indexOf('---', 3);
    if (endIndex !== -1) {
      const frontmatter = content.slice(3, endIndex);
      body = content.slice(endIndex + 3).trim();
      
      // Extract description from frontmatter
      const descMatch = frontmatter.match(/description:\s*(.+)/);
      if (descMatch) {
        description = descMatch[1].trim();
      }
      
      // Extract name from frontmatter
      const nameMatch = frontmatter.match(/name:\s*(.+)/);
      if (nameMatch) {
        name = nameMatch[1].trim();
      }
    }
  } else {
    // No frontmatter - check for # heading to use as description
    const headingMatch = content.match(/^#\s+(.+)/m);
    if (headingMatch) {
      description = headingMatch[1].trim();
    }
  }
  
  // Create the cursor rule content (no frontmatter = manual only, triggered by @mention)
  const ruleContent = `${body}
`;
  
  // Write to .cursor/rules/ with .mdc extension
  const outputFile = path.join(rulesDir, `${name}.mdc`);
  fs.writeFileSync(outputFile, ruleContent);
  console.log(`✓ Created: ${name}.mdc`);
}

console.log(`\nDone! Created ${agentFiles.length} cursor rule files in .cursor/rules/`);

