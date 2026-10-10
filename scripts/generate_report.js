const fs = require('fs');
const logContent = fs.readFileSync('/tmp/git_log.txt', 'utf8');
const lines = logContent.trim().split('\n');

const commitsByDate = {};
for (const line of lines) {
  const parts = line.split('|');
  if (parts.length >= 2) {
    const date = parts[0];
    const msg = parts.slice(1).join('|');
    if (!commitsByDate[date]) {
      commitsByDate[date] = [];
    }
    commitsByDate[date].push(msg);
  }
}

let md = `# Informe General de Desarrollo: Proyecto Naguanagua\n\n`;
md += `**Generado el:** ${new Date().toLocaleDateString()}\n\n`;
md += `Este documento detalla todas las actualizaciones, correcciones y nuevas funcionalidades implementadas desde el inicio del proyecto (Septiembre 2026).\n\n`;

for (const date of Object.keys(commitsByDate).sort((a, b) => b.localeCompare(a))) {
  md += `## 📅 Fecha: ${date}\n\n`;
  for (const commit of commitsByDate[date]) {
    // try to beautify conventional commits
    let formattedMsg = commit;
    if (commit.startsWith('feat')) formattedMsg = `✨ **Nueva Funcionalidad:** ${commit.replace(/^feat(\([^)]+\))?:\s*/, '')}`;
    else if (commit.startsWith('fix')) formattedMsg = `🐛 **Corrección:** ${commit.replace(/^fix(\([^)]+\))?:\s*/, '')}`;
    else if (commit.startsWith('refactor')) formattedMsg = `♻️ **Refactorización:** ${commit.replace(/^refactor(\([^)]+\))?:\s*/, '')}`;
    else if (commit.startsWith('perf')) formattedMsg = `⚡ **Rendimiento:** ${commit.replace(/^perf(\([^)]+\))?:\s*/, '')}`;
    else if (commit.startsWith('style')) formattedMsg = `🎨 **Diseño/Estilo:** ${commit.replace(/^style(\([^)]+\))?:\s*/, '')}`;
    else if (commit.startsWith('security')) formattedMsg = `🔒 **Seguridad:** ${commit.replace(/^security(\([^)]+\))?:\s*/, '')}`;
    else formattedMsg = `📌 ${commit}`;
    
    md += `- ${formattedMsg}\n`;
  }
  md += `\n`;
}

fs.writeFileSync('/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/Informe_Completo_Naguanagua.md', md);
console.log('Markdown generated successfully.');
