const fs = require('fs');
const path = require('path');

const BASE = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src';

// ── 1. Create new independent route /cobro-movil ──
const newDir = BASE + '/app/cobro-movil';
fs.mkdirSync(newDir, { recursive: true });

// ── 2. Copy layout and page from old location ──
const oldDir = BASE + '/app/(admin)/admin/cobro-movil';
const layoutSrc = fs.readFileSync(oldDir + '/layout.tsx', 'utf8');
const pageSrc = fs.readFileSync(oldDir + '/page.tsx', 'utf8');

// Fix the layout: remove admin_auth_andministrador setting (don't leak admin access)
const fixedLayout = layoutSrc
  .replace(
    "      // Also set admin auth so AppContext works\n      localStorage.setItem('admin_auth_andministrador', 'true');\n      localStorage.setItem('admin_user_data', JSON.stringify(data));",
    "      // Store cobrador data for AppContext\n      localStorage.setItem('cobro_movil_user_data', JSON.stringify(data));"
  );

fs.writeFileSync(newDir + '/layout.tsx', fixedLayout);
fs.writeFileSync(newDir + '/page.tsx', pageSrc);
console.log('✅ /cobro-movil route created at src/app/cobro-movil/');

// ── 3. Delete old admin/cobro-movil ──
fs.rmSync(oldDir, { recursive: true, force: true });
console.log('✅ Old /admin/cobro-movil deleted');

// ── 4. Update landing page link from /admin/cobro-movil to /cobro-movil ──
const pagePath = BASE + '/app/page.tsx';
let page = fs.readFileSync(pagePath, 'utf8');
page = page.replace('href="/admin/cobro-movil"', 'href="/cobro-movil"');
fs.writeFileSync(pagePath, page);
console.log('✅ Landing page link updated to /cobro-movil');

// ── 5. Update admin dashboard card link ──
const adminPagePath = BASE + '/app/(admin)/admin/page.tsx';
let adminPage = fs.readFileSync(adminPagePath, 'utf8');
adminPage = adminPage.replace(/href="\/admin\/cobro-movil"/g, 'href="/cobro-movil"');
fs.writeFileSync(adminPagePath, adminPage);
console.log('✅ Admin dashboard card link updated');

// ── 6. Update sidebar link ──
const sidebarPath = BASE + '/components/Sidebar.tsx';
let sidebar = fs.readFileSync(sidebarPath, 'utf8');
sidebar = sidebar.replace("href: '/admin/cobro-movil'", "href: '/cobro-movil'");
fs.writeFileSync(sidebarPath, sidebar);
console.log('✅ Sidebar link updated');

console.log('\n🎉 Cobro Movil is now a completely independent route at /cobro-movil');
console.log('   - Does NOT share session with admin system');
console.log('   - Has its own authentication (trabajadores table)');
console.log('   - Session stored in cobro_movil_auth (8h)');
