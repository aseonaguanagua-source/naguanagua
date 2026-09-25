async function testLogin() {
  try {
    const res = await fetch('https://naguanagua.globalgreenrec.com/');
    const html = await res.text();
    
    // Extract script tags
    const scriptRegex = /<script src="(.*?)"/g;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      console.log("Found script:", match[1]);
      
      if(match[1].includes('main')) {
         const mainRes = await fetch('https://naguanagua.globalgreenrec.com/' + match[1]);
         const mainText = await mainRes.text();
         // Look for API endpoints in the main js
         const apiMatches = mainText.match(/https?:\/\/[a-zA-Z0-9.\-_]+(?:\/api)?/g);
         if(apiMatches) {
            console.log("Possible API Endpoints:");
            console.log([...new Set(apiMatches)]);
         }
      }
    }
  } catch (e) {
    console.error(e.message);
  }
}

testLogin();
