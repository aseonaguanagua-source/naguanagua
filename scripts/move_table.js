const fs = require('fs');
const path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/caja/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const blockStart = '{/* ── SELECCION DE LOCALES CONDOMINIO ── */}';

const startIndex = content.indexOf(blockStart);
const endIndex = content.indexOf('          {/* Panel de Pago Disgregado */}');

if (startIndex !== -1 && endIndex !== -1) {
    const blockToMove = content.substring(startIndex, endIndex);
    
    // Remove it from its current position
    content = content.replace(blockToMove, '');
    
    // Place it before the closing div of the main container or right after the grid.
    // Let's find: "{isCondominioModalOpen && ("
    const modalStart = '{isCondominioModalOpen && (';
    if (content.includes(modalStart)) {
        // Find the index of modalStart and insert it there.
        content = content.replace(modalStart, blockToMove + '\n\n      ' + modalStart);
        fs.writeFileSync(path, content, 'utf8');
        console.log('Moved table successfully!');
    } else {
        console.log('Could not find modalStart');
    }
} else {
    console.log('Could not find start or end index of block');
}
