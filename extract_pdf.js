const fs = require('fs');
const PDFParser = require("pdf2json");

const pdfParser = new PDFParser(this, 1);

pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError) );
pdfParser.on("pdfParser_dataReady", pdfData => {
    fs.writeFileSync('./pdf_text.txt', pdfParser.getRawTextContent());
    console.log("Extracted text saved to pdf_text.txt");
});

pdfParser.loadPDF("./usuarios_na_comercial_solo.pdf");
