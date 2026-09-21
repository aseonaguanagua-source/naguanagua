import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { logos } from './logosBase64';

export const exportToExcelWithLogos = async (
  data: any[],
  filename: string,
  sheetName: string = 'Data'
) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  const addLogo = (base64Str: string, col: number, row: number, width: number, height: number) => {
    try {
      const imageId = workbook.addImage({
        base64: base64Str,
        extension: 'jpeg',
      });
      worksheet.addImage(imageId, {
        tl: { col: col, row: row },
        ext: { width, height }
      });
    } catch (e) {
      console.warn('Could not add image to excel', e);
    }
  };

  addLogo(logos.alcaldia, 0, 0, 100, 100);
  addLogo(logos.isma, 2, 0, 100, 100);
  addLogo(logos.global_rec, 4, 0, 100, 100);
  addLogo(logos.basura_cero, 6, 0, 100, 100);

  for (let i = 0; i < 6; i++) {
    worksheet.addRow([]);
  }

  const titleRow = worksheet.addRow([`Reporte: ${sheetName}`]);
  titleRow.font = { size: 16, bold: true };
  worksheet.addRow([]);

  if (data.length > 0) {
    const headers = Object.keys(data[0]);
    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true };

    data.forEach(item => {
      worksheet.addRow(Object.values(item));
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), filename);
};
