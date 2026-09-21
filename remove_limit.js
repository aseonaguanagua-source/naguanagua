const fs = require('fs');

async function run() {
  const filePath = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/admin/caja/page.tsx';
  let content = fs.readFileSync(filePath, 'utf8');
  
  const targetRegex = /const isItemPending = \(ref: string\) => \{[\s\S]*?catch\(e\) \{ return false; \}\s*\}\);\s*\};/m;
  const replacement = `const isItemPending = (ref: string) => {\n    return false;\n  };`;
  
  if (targetRegex.test(content)) {
    content = content.replace(targetRegex, replacement);
    fs.writeFileSync(filePath, content);
    console.log("Limitation removed successfully using regex!");
  } else {
    console.log("Target not found with regex.");
  }
}

run();
