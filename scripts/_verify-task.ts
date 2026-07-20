import PDFDocument from 'pdfkit';

const doc = new PDFDocument({ size: 'A4', margin: 50 });
const chunks: Buffer[] = [];
doc.on('data', (chunk) => chunks.push(chunk));
doc.on('end', () => { console.log('done, bytes:', Buffer.concat(chunks).length); });
doc.on('error', (error) => console.error('pdf error:', error));
doc.fontSize(18).text('Hello world', 50, 50);
doc.end();
