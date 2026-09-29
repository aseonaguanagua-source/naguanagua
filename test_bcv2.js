const cheerio = require('cheerio');

async function test() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const response = await fetch('https://www.bcv.org.ve/', { 
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    }
  });
  
  if (!response.ok) {
    console.log("FAILED");
    return;
  }
  const html = await response.text();
  const $ = cheerio.load(html);
  
  let euroText = $('#euro strong').text().trim().replace(',', '.');
  console.log("EURO BCV RATE:", euroText);
}
test();
