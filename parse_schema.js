const fs = require('fs');
const sql = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql', 'utf8');

const m1 = sql.match(/INSERT INTO public."?properties"? \(([^)]+)\)/i);
if (m1) console.log("properties columns:", m1[1]);

const m2 = sql.match(/INSERT INTO public."?economic_activities"? \(([^)]+)\)/i);
if (m2) console.log("economic_activities columns:", m2[1]);

const m3 = sql.match(/INSERT INTO public."?taxpayer_economic_activities"? \(([^)]+)\)/i);
if (m3) console.log("taxpayer_economic_activities columns:", m3[1]);

const m4 = sql.match(/INSERT INTO public."?economic_activities_taxpayers"? \(([^)]+)\)/i);
if (m4) console.log("economic_activities_taxpayers columns:", m4[1]);
