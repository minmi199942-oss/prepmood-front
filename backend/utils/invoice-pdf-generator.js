/**
 * 인보이스 PDF 생성 (문서 8.4, 11절 3단계)
 * invoices 테이블 행 또는 payload_json 기반으로 1장 분량 PDF 버퍼 반환.
 */

const PDFDocument = require('pdfkit');

/**
 * @param {Object} invoiceRow - DB 인보이스 행 (payload_json, invoice_number, billing_*, shipping_*, total_amount, issued_at 등)
 * @returns {Promise<Buffer>}
 */
function generateInvoicePdfBuffer(invoiceRow) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        try {
            const payload = (invoiceRow.payload_json && typeof invoiceRow.payload_json === 'object')
                ? invoiceRow.payload_json
                : (typeof invoiceRow.payload_json === 'string' ? JSON.parse(invoiceRow.payload_json) : null);
            const invoiceNumber = invoiceRow.invoice_number || '-';
            const issuedAt = invoiceRow.issued_at
                ? new Date(invoiceRow.issued_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
                : '-';
            const totalAmount = invoiceRow.total_amount != null ? Number(invoiceRow.total_amount) : (payload?.amounts?.total ?? 0);
            const currency = invoiceRow.currency || (payload && payload.amounts && payload.amounts.currency) ? payload.amounts.currency : 'KRW';
            const billing = (payload && payload.billing) ? payload.billing : {};
            const shipping = (payload && payload.shipping) ? payload.shipping : {};
            const items = (payload && Array.isArray(payload.items)) ? payload.items : [];

            let y = 50;
            doc.fontSize(18).text('Invoice / 인보이스', 50, y);
            y += 28;
            doc.fontSize(10).text(`Invoice No: ${invoiceNumber}`, 50, y);
            y += 14;
            doc.text(`Issued: ${issuedAt}`, 50, y);
            y += 20;

            doc.fontSize(11).text('Billing', 50, y);
            y += 14;
            doc.fontSize(9);
            doc.text(`${billing.name || invoiceRow.billing_name || '-'}`, 50, y); y += 12;
            doc.text(`${billing.email || invoiceRow.billing_email || ''}`, 50, y); y += 12;
            doc.text(`${billing.phone || invoiceRow.billing_phone || ''}`, 50, y); y += 12;
            const billingAddr = billing.address ? [billing.address.address, billing.address.city, billing.address.postal_code, billing.address.country].filter(Boolean).join(', ') : '';
            if (billingAddr) { doc.text(billingAddr, 50, y); y += 12; }
            y += 10;

            doc.fontSize(11).text('Shipping', 50, y);
            y += 14;
            doc.fontSize(9);
            doc.text(`${shipping.name || invoiceRow.shipping_name || '-'}`, 50, y); y += 12;
            doc.text(`${shipping.email || invoiceRow.shipping_email || ''}`, 50, y); y += 12;
            doc.text(`${shipping.phone || invoiceRow.shipping_phone || ''}`, 50, y); y += 12;
            const shipAddr = shipping.address ? [shipping.address.address, shipping.address.city, shipping.address.postal_code, shipping.address.country].filter(Boolean).join(', ') : '';
            if (shipAddr) { doc.text(shipAddr, 50, y); y += 12; }
            y += 10;

            doc.fontSize(11).text('Items', 50, y);
            y += 14;
            doc.fontSize(9);
            items.forEach((item, i) => {
                const name = item.product_name || '-';
                const qty = item.quantity != null ? item.quantity : 0;
                const price = item.unit_price != null ? Number(item.unit_price) : 0;
                const subtotal = item.subtotal != null ? Number(item.subtotal) : (qty * price);
                doc.text(`${i + 1}. ${name} (Qty: ${qty}) — ${currency} ${subtotal.toLocaleString()}`, 50, y);
                y += 14;
            });
            y += 10;
            doc.fontSize(11).text(`Total: ${currency} ${Number(totalAmount).toLocaleString()}`, 50, y);
            doc.end();
        } catch (err) {
            doc.end();
            reject(err);
        }
    });
}

module.exports = {
    generateInvoicePdfBuffer
};
