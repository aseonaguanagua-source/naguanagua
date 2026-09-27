const fs = require('fs');
const file = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/cobro-movil/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const target1 = `    const sourceInms = userInms.length > 0 ? userInms : (inmuebles || []);
    const calcInms = sourceInms.filter((i: any) =>
      (i.identidad || '').replace(/-/g,'').toUpperCase() === (foundUser.Identidad || '').replace(/-/g,'').toUpperCase()
    );`;

const replace1 = `    const sourceInms = userInms.length > 0 ? userInms : (inmuebles || []);
    const calcInms = sourceInms.filter((i: any) => {
      const fid = (foundUser.Identidad || '').replace(/-/g,'').toUpperCase();
      if ((i.identidad || '').replace(/-/g,'').toUpperCase() === fid) return true;
      if (userInms.length > 0) return true;
      return false;
    });`;

const target2 = `                        const userInmsArr = (userInms || []).filter((i: any) => {
                          if (!foundUser) return false;
                          const id = (i.identidad || '').replace(/-/g,'').toUpperCase();
                          const fid = (foundUser.Identidad || '').replace(/-/g,'').toUpperCase();
                          return id === fid;
                        });`;
// wait, the render block in cobro movil has:
const target3 = `                        const userInmsLocal = (userInms || []).filter((i: any) => {`;
// Actually, let's just replace all instances of:
// const id = (i.identidad || '').replace(/-/g,'').toUpperCase();
// const fid = (foundUser.Identidad || '').replace(/-/g,'').toUpperCase();
// return id === fid;

