const c = { meses: "0" };
const res = Math.max(0, parseInt(c.meses) || 0);
console.log("parseInt:", parseInt(c.meses));
console.log("|| 0:", parseInt(c.meses) || 0);
console.log("Math.max:", res);
