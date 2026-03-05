/**
 * 인보이스 PDF 생성 (문서 8.4, 11절 3단계)
 * - generateInvoicePdfBuffer: pdfkit 기반 단순 레이아웃 (폴백용)
 * - generateInvoiceHtml: invoice-detail-grid와 동일한 HTML 문자열 (Puppeteer PDF용 1단계)
 * 한글 표시: prep_server/static/fonts/NotoSansKR-Regular.ttf 가 있으면 사용 (없으면 기본 폰트로 한글 깨짐).
 *
 * VPS에서 Puppeteer 실패 시 (libatk-1.0.so.0: cannot open shared object file):
 *   Debian/Ubuntu: sudo apt-get update && sudo apt-get install -y libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libnss3 libnspr4 libxss1 libpangocairo-1.0-0 libpango-1.0-0 libcairo2
 *   (Ubuntu 25+: libasound2 대신 libasound2t64 사용 가능; 없으면 생략해도 headless는 동작할 수 있음)
 * pdfkit 폴백에서 한글이 깨지면 (Puppeteer가 실패하는 경우): VPS에 한글 폰트 설치 후 재시작
 *   Ubuntu: sudo apt-get install -y fonts-noto-cjk   (또는 fonts-noto-cjk-extra)
 */

const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const Logger = require('../logger');

/** 동시 실행 제한용 (2단계: Puppeteer PDF) */
const PDF_CONCURRENT_MAX = Math.max(1, parseInt(process.env.INVOICE_PDF_CONCURRENT_MAX, 10) || 2);
let pdfConcurrentRunning = 0;
const pdfWaitQueue = [];

function pdfAcquire() {
    return new Promise((resolve) => {
        if (pdfConcurrentRunning < PDF_CONCURRENT_MAX) {
            pdfConcurrentRunning += 1;
            resolve();
            return;
        }
        pdfWaitQueue.push(resolve);
    });
}

function pdfRelease() {
    pdfConcurrentRunning -= 1;
    if (pdfWaitQueue.length > 0) {
        pdfConcurrentRunning += 1;
        const next = pdfWaitQueue.shift();
        if (next) next();
    }
}

/** 한글 폰트 경로: 환경변수 → prep_server → Windows 맑은고딕 → Linux Noto/Nanum 순으로 탐색 */
const FONT_KR_CANDIDATES = [
    process.env.INVOICE_PDF_FONT_KR,
    path.join(__dirname, '..', '..', 'prep_server', 'static', 'fonts', 'NotoSansKR-Regular.ttf'),
    process.platform === 'win32' ? path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'malgun.ttf') : null,
    process.platform === 'linux' ? '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc' : null,
    process.platform === 'linux' ? '/usr/share/fonts/opentype/noto/NotoSansCJK.ttc' : null,
    process.platform === 'linux' ? '/usr/share/fonts/truetype/nanum/NanumGothic.ttf' : null
].filter(Boolean);
const FONT_KR_PATH = FONT_KR_CANDIDATES.find(p => fs.existsSync(p)) || null;
const HAS_KOREAN_FONT = !!FONT_KR_PATH;

// ---------------------------------------------------------------------------
// HTML 템플릿 (Puppeteer PDF 1단계) — invoice-detail-grid.css PC 블록 인라인
// INVOICE_DETAIL_STYLE_AND_STRUCTURE_FOR_PDF.md, invoice-detail-grid.css 176~483 라인 기준
// ---------------------------------------------------------------------------

const INVOICE_PC_CSS = `*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Paperlogy',Georgia,serif;color:#000;background-color:transparent;padding:0;margin:0;}
.invoice-page{width:751.4px;height:990px;background-color:#fff;box-shadow:none;margin:0;border:none;display:grid;grid-template-rows:159px 1px 238px 1px 247.5px 1px 162px;grid-template-columns:1fr;padding:80px 85px 80px 100px;position:relative;overflow:hidden;}
.invoice-page.extended-items{grid-template-rows:159px 1px 486.5px 1px 162px;}
.invoice-page .grid-sep{grid-column:1;min-height:0;overflow:visible;display:flex;align-items:flex-start;justify-content:stretch;}
.invoice-page .grid-sep-inner{width:100%;height:0.5px;background-color:#e0e0e0;margin-left:10px;margin-right:0;}
.invoice-page .grid-sep-footer .grid-sep-inner{background-color:rgba(204,204,204,1);margin-left:6px;}
.invoice-page .grid-sep-price .grid-sep-inner{background-color:rgba(204,204,204,1);margin-left:34px;}
.invoice-page .grid-sep-hidden,.invoice-page .grid-summary-hidden{visibility:hidden;pointer-events:none;}
.invoice-page .grid-header{grid-column:1;min-height:0;display:flex;justify-content:space-between;align-items:flex-start;}
.invoice-page .grid-items{grid-column:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:0;padding-top:35px;padding-bottom:45.5px;}
.invoice-page .grid-summary{grid-column:1;min-height:0;display:flex;justify-content:flex-end;align-items:flex-start;padding-top:30px;}
.invoice-page .grid-footer{grid-column:1;min-height:0;display:flex;gap:40px;justify-content:flex-start;align-items:flex-start;padding-top:45px;}
.invoice-page .invoice-header-left{flex:1;}
.invoice-page .invoice-header-title{font-family:'Paperlogy',Georgia,serif;font-weight:700;font-size:17px;letter-spacing:2px;margin-bottom:10.5px;}
.invoice-page .invoice-header-meta{font-family:'Paperlogy',Georgia,serif;font-weight:500;font-size:11px;letter-spacing:1px;line-height:17.6px;display:flex;flex-direction:column;gap:16px;}
.invoice-page .invoice-header-right{text-align:right;}
.invoice-page .invoice-brand-logo{width:198px;height:37px;display:block;object-fit:contain;}
.invoice-page .invoice-section-title{font-family:'Paperlogy',Georgia,serif;font-weight:710;font-size:16px;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;}
.invoice-page .invoice-items-table{width:566.4px;border-collapse:collapse;table-layout:fixed;}
.invoice-page .invoice-items-table thead{display:none;}
.invoice-page .invoice-items-table td{font-family:'Paperlogy',Georgia,serif;font-weight:400;font-size:11px;color:#000;letter-spacing:0.5px;padding:6px 0 12px 0;vertical-align:top;}
.invoice-page .invoice-items-table td:nth-child(1){width:55%;text-align:left;letter-spacing:1.6px;font-weight:400;}
.invoice-page .invoice-items-table td:nth-child(2){width:10.4%;text-align:center;padding-left:23px;font-weight:400;}
.invoice-page .invoice-items-table td:nth-child(3){width:34.6%;text-align:right;letter-spacing:1.5px;font-weight:400;padding-right:0;}
.invoice-page .invoice-summary-container{min-width:250px;max-width:250px;flex-shrink:0;overflow:hidden;}
.invoice-page .invoice-summary-row{margin-bottom:20px;display:flex;justify-content:space-between;align-items:baseline;gap:24px;font-family:'Paperlogy',Georgia,serif;font-size:11px;font-weight:400;color:#000;letter-spacing:1.5px;}
.invoice-page .invoice-summary-label{text-align:left;padding-left:29.5px;flex-shrink:0;}
.invoice-page .invoice-summary-value{white-space:nowrap;flex-shrink:0;}
.invoice-page .invoice-summary-row.total{margin-top:65px;margin-bottom:28px;padding-top:31.5px;position:relative;font-weight:400;}
.invoice-page .invoice-summary-row.total::before{content:'';position:absolute;top:0;left:34px;right:0;height:0.5px;background-color:rgba(204,204,204,1);}
.invoice-page .invoice-footer-section{flex:0 0 auto;font-weight:470;}
.invoice-page .invoice-footer-section:first-child{width:265.3px;}
.invoice-page .invoice-footer-section:last-child{width:261.2px;}
.invoice-page .invoice-footer-title{font-family:'Paperlogy',Georgia,serif;font-weight:701;font-size:13px;color:#000;letter-spacing:2px;margin-bottom:18.8px;text-transform:uppercase;}
.invoice-page .invoice-footer-info{display:flex;flex-direction:column;gap:20px;}
.invoice-page .invoice-footer-row{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:baseline;font-family:'Paperlogy',Georgia,serif;font-size:12px;color:#000;letter-spacing:0.9px;}
.invoice-page .invoice-footer-label{font-weight:500;text-transform:uppercase;white-space:nowrap;}
.invoice-page .invoice-footer-value{text-align:right;white-space:nowrap;}
.invoice-page .invoice-footer-section:last-child .invoice-footer-row{gap:12px;}
.invoice-page .invoice-footer-section:last-child .invoice-footer-label{text-align:right;padding-left:41px;}
.invoice-page .invoice-footer-section:last-child .invoice-footer-title{padding-left:40px;}
@page{size:751.4px 990px;margin:0;}
@media print{.invoice-page{page-break-after:always}.invoice-page:last-child{page-break-after:avoid}}
`;

function escapeHtml(text) {
    if (text == null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatCurrency(amount, currency) {
    currency = currency || 'KRW';
    if (typeof amount === 'string') amount = parseFloat(amount, 10);
    if (isNaN(amount)) amount = 0;
    const formattedAmount = amount.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const currencyMap = { KRW: 'KRW', USD: 'USD', EUR: 'EUR', JPY: 'JPY' };
    const code = currencyMap[currency] || currency;
    return '$ ' + formattedAmount + ' ' + code;
}

function formatIssueDate(dateInput) {
    if (!dateInput) return '';
    try {
        const date = new Date(dateInput);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const day = String(date.getDate()).padStart(2, '0');
        const month = months[date.getMonth()];
        const year = date.getFullYear();
        return day + ' ' + month + ' ' + year;
    } catch (e) {
        return typeof dateInput === 'string' ? dateInput : '';
    }
}

function maskEmail(email) {
    if (!email || typeof email !== 'string') return 'N/A';
    const parts = email.split('@');
    if (parts.length !== 2) return escapeHtml(email);
    const local = parts[0];
    const domain = parts[1];
    const n = local.length;
    const mask = n <= 2 ? local.substring(0, 1) + '*'
        : n <= 5 ? local.substring(0, 2) + '***'
        : n <= 9 ? local.substring(0, 3) + '***'
        : local.substring(0, 4) + '***';
    return escapeHtml(mask + '@' + domain);
}

function getLogoSvg() {
    return '<svg class="invoice-brand-logo" viewBox="0 0 155 29" fill="none" xmlns="http://www.w3.org/2000/svg">'
        + '<path d="M51.704 23.934C51.704 24.363 51.5469 24.729 51.2349 25.033C50.9229 25.336 50.5609 25.487 50.1509 25.487C49.7209 25.487 49.3549 25.336 49.0519 25.033C48.7489 24.729 48.5979 24.363 48.5979 23.934C48.5979 23.524 48.7489 23.163 49.0519 22.85C49.3549 22.537 49.7209 22.381 50.1509 22.381C50.5609 22.381 50.9219 22.537 51.2349 22.85C51.5469 23.162 51.704 23.524 51.704 23.934Z" fill="#040000"/>'
        + '<path d="M0.0889893 2.69601V1.93402C0.733989 1.97302 1.33799 1.99301 1.90399 1.99301H4.39398C4.58898 1.99301 4.78498 1.98302 4.97998 1.96402C5.17498 1.96402 5.38499 1.95902 5.60999 1.94902C5.83499 1.93902 6.10295 1.93402 6.41595 1.93402C7.15795 1.93402 7.95899 2.02702 8.81799 2.21202C9.67699 2.39702 10.477 2.70501 11.22 3.13501C11.942 3.58401 12.547 4.18501 13.035 4.93701C13.523 5.68901 13.767 6.63101 13.767 7.76401C13.767 8.64201 13.581 9.43803 13.21 10.151C12.839 10.865 12.351 11.484 11.745 12.011C11.16 12.519 10.49 12.914 9.73895 13.198C8.98695 13.481 8.22996 13.623 7.46796 13.623H6.64801C6.53101 13.623 6.41396 13.618 6.29596 13.608C6.17796 13.598 6.071 13.593 5.974 13.593V12.626C6.15 12.665 6.32999 12.685 6.51599 12.685H7.08698C7.71198 12.685 8.29797 12.548 8.84497 12.275C9.39097 12.002 9.87001 11.64 10.281 11.191C10.692 10.742 11.013 10.244 11.248 9.69702C11.481 9.15102 11.599 8.61303 11.599 8.08603C11.599 7.07103 11.394 6.23202 10.985 5.56702C10.575 4.90302 10.077 4.36602 9.49097 3.95602C8.90497 3.56502 8.28498 3.28702 7.63098 3.12102C6.97698 2.95502 6.41498 2.87202 5.94598 2.87202C5.71198 2.87202 5.47698 2.88202 5.24298 2.90102C5.00898 2.92002 4.81298 2.94002 4.65698 2.96002V19.511C4.65698 20.038 4.71999 20.445 4.84698 20.727C4.97398 21.01 5.15498 21.21 5.38898 21.328C5.62298 21.465 5.90695 21.548 6.23895 21.577C6.57095 21.606 6.94199 21.621 7.35199 21.621V22.383H6.38501C6.11201 22.383 5.84799 22.373 5.59399 22.354C5.33999 22.354 5.08099 22.349 4.81799 22.339C4.55499 22.329 4.26598 22.324 3.95398 22.324C3.60198 22.324 3.26599 22.329 2.94299 22.339C2.61999 22.349 2.30297 22.354 1.99097 22.354C1.67897 22.354 1.35596 22.359 1.02496 22.369C0.691963 22.379 0.351 22.384 0 22.384V21.622C0.37 21.622 0.721993 21.607 1.05499 21.578C1.38599 21.549 1.66899 21.466 1.90399 21.329C2.13799 21.212 2.324 21.012 2.461 20.728C2.598 20.446 2.66595 20.04 2.66595 19.512V5.56902C2.66595 4.45602 2.50996 3.69902 2.19696 3.29802C1.88396 2.89702 1.18099 2.69702 0.0889893 2.69702V2.69601Z" fill="#040000"/>'
        + '<path d="M17.8999 22.381V21.619H18.6909C19.1009 21.619 19.4369 21.58 19.7009 21.502C19.9649 21.424 20.0969 21.141 20.0969 20.652V12.421C20.0969 12.206 20.0339 12.025 19.9069 11.879C19.7799 11.733 19.6379 11.61 19.4819 11.513C19.3259 11.435 19.1609 11.362 18.9849 11.293C18.8089 11.224 18.672 11.161 18.575 11.103V10.664C19.102 10.449 19.5409 10.239 19.8919 10.034C20.2429 9.82903 20.5369 9.649 20.7709 9.492C20.9859 9.356 21.1519 9.23901 21.2689 9.14001C21.3859 9.04301 21.484 8.99402 21.562 8.99402C21.64 8.99402 21.7039 9.02303 21.7519 9.08203C21.7999 9.14103 21.825 9.23903 21.825 9.37503V12.012H21.8839C22.0599 11.739 22.2699 11.426 22.5139 11.074C22.7579 10.722 23.0359 10.39 23.3489 10.078C23.6609 9.785 24.0079 9.53201 24.3889 9.31601C24.7699 9.10201 25.1849 8.99402 25.6339 8.99402C25.9859 8.99402 26.3519 9.10702 26.7329 9.33102C27.1139 9.55602 27.3039 9.93201 27.3039 10.459C27.3039 10.869 27.1759 11.206 26.9229 11.47C26.6689 11.734 26.3369 11.866 25.9269 11.866C25.6929 11.886 25.5069 11.861 25.3699 11.793C25.2329 11.725 25.1059 11.651 24.9889 11.573C24.8719 11.495 24.7399 11.422 24.5929 11.353C24.4459 11.284 24.2459 11.25 23.9919 11.25C23.8549 11.25 23.6699 11.299 23.4349 11.396C23.1999 11.493 22.9659 11.65 22.7319 11.865C22.4979 12.06 22.2929 12.319 22.1169 12.641C21.9409 12.963 21.8529 13.339 21.8529 13.769V20.653C21.8529 21.141 21.9849 21.424 22.2489 21.503C22.5129 21.582 22.8499 21.62 23.2599 21.62H24.9009V22.382C24.4909 22.382 24.1199 22.377 23.7879 22.367C23.4559 22.357 23.1429 22.352 22.8499 22.352C22.5569 22.352 22.2689 22.347 21.9859 22.337C21.7029 22.327 21.4049 22.322 21.0919 22.322C20.7789 22.322 20.487 22.327 20.213 22.337C19.939 22.347 19.6759 22.352 19.4219 22.352C19.1679 22.352 18.9139 22.357 18.6609 22.367C18.4059 22.377 18.1519 22.382 17.8989 22.382L17.8999 22.381Z" fill="#040000"/>'
        + '<path d="M41.7438 14.296H33.2198C33.1808 14.433 33.1609 14.628 33.1609 14.882C33.1609 15.136 33.1808 15.507 33.2198 15.995C33.2978 17.401 33.7179 18.601 34.4799 19.598C35.2419 20.595 36.3439 21.092 37.7899 21.092C38.5909 21.092 39.3178 20.897 39.9728 20.506C40.6278 20.115 41.2278 19.647 41.7748 19.1L42.1849 19.51C41.5009 20.408 40.7199 21.19 39.8409 21.854C38.9619 22.518 37.9269 22.85 36.7369 22.85C35.6629 22.85 34.7839 22.606 34.0999 22.118C33.4159 21.63 32.8788 21.044 32.4888 20.36C32.0988 19.676 31.8299 18.968 31.6829 18.236C31.5369 17.505 31.4629 16.904 31.4629 16.435C31.4629 15.009 31.6579 13.818 32.0489 12.861C32.4399 11.904 32.9179 11.142 33.4849 10.576C34.0709 10.01 34.6859 9.60502 35.3309 9.36002C35.9759 9.11702 36.5608 8.99402 37.0888 8.99402C37.6738 8.99402 38.2599 9.09302 38.8459 9.28702C39.4319 9.48202 39.9589 9.76602 40.4279 10.137C40.8969 10.529 41.2779 11.011 41.5709 11.587C41.8639 12.163 42.0199 12.832 42.0399 13.594C42.0399 13.692 42.0348 13.784 42.0248 13.872C42.0148 13.96 42.0098 14.043 42.0098 14.121L41.7459 14.297L41.7438 14.296ZM33.3079 13.359H39.2839C39.6359 13.359 39.8598 13.281 39.9578 13.125C40.0558 12.969 40.1038 12.803 40.1038 12.627C40.1038 11.885 39.7869 11.25 39.1519 10.723C38.5169 10.196 37.7899 9.93201 36.9699 9.93201C36.0709 9.93201 35.2809 10.24 34.5969 10.855C33.9129 11.47 33.4839 12.305 33.3079 13.36V13.359Z" fill="#040000"/>'
        + '<path d="M61.722 22.264V26.717C61.722 27.069 61.868 27.273 62.161 27.331C62.454 27.389 62.766 27.419 63.099 27.419H64.417V28.181C64.085 28.181 63.782 28.176 63.509 28.166C63.236 28.156 62.9621 28.151 62.6891 28.151C62.3961 28.151 62.113 28.146 61.839 28.136C61.565 28.126 61.2731 28.121 60.9601 28.121C60.6471 28.121 60.3551 28.126 60.0811 28.136C59.8071 28.146 59.544 28.151 59.291 28.151C59.017 28.151 58.7431 28.156 58.4711 28.166C58.1971 28.176 57.9141 28.181 57.6211 28.181V27.419H58.734C59.261 27.419 59.597 27.321 59.744 27.127C59.89 26.931 59.964 26.717 59.964 26.482V13.475C59.964 12.928 59.9101 12.508 59.8031 12.215C59.6961 11.922 59.5641 11.697 59.4081 11.541C59.2511 11.404 59.0651 11.302 58.8511 11.233C58.6351 11.165 58.4301 11.072 58.2361 10.955V10.516C58.5081 10.399 58.757 10.272 58.983 10.135C59.207 9.99901 59.426 9.86201 59.641 9.72501C59.856 9.58901 60.0801 9.45701 60.3151 9.32901C60.5491 9.20301 60.8131 9.07101 61.1061 8.93301C61.1261 8.93301 61.145 8.92903 61.165 8.91803C61.185 8.90903 61.2141 8.89502 61.2531 8.87402C61.2731 8.85502 61.292 8.84102 61.312 8.83002C61.332 8.82102 61.361 8.815 61.4 8.815C61.459 8.815 61.5271 8.83001 61.6051 8.85901C61.6831 8.88801 61.722 8.96201 61.722 9.07901V11.159C62.288 10.651 62.9481 10.163 63.7001 9.69403C64.4521 9.22503 65.267 8.99103 66.146 8.99103C66.966 8.99103 67.6881 9.178 68.3141 9.548C68.9381 9.919 69.4751 10.398 69.9241 10.984C70.3541 11.57 70.681 12.234 70.905 12.976C71.129 13.718 71.2421 14.47 71.2421 15.232C71.2421 16.248 71.071 17.214 70.729 18.131C70.387 19.05 69.9041 19.85 69.2791 20.533C68.6741 21.236 67.947 21.793 67.097 22.203C66.247 22.613 65.325 22.818 64.328 22.818C63.918 22.818 63.4691 22.769 62.9801 22.672C62.4911 22.575 62.0721 22.438 61.7201 22.262L61.722 22.264ZM69.485 16.435C69.485 15.654 69.3781 14.887 69.1631 14.135C68.9481 13.383 68.626 12.734 68.197 12.187C67.766 11.621 67.2301 11.196 66.5861 10.913C65.9411 10.631 65.1901 10.547 64.3301 10.664C63.8421 10.742 63.353 10.918 62.865 11.191C62.377 11.464 61.996 11.699 61.722 11.894V19.862C61.8 20.038 61.927 20.243 62.103 20.477C62.279 20.711 62.494 20.936 62.748 21.151C63.002 21.366 63.3001 21.542 63.6421 21.678C63.9841 21.814 64.389 21.883 64.858 21.883C65.561 21.883 66.1951 21.722 66.7621 21.4C67.3281 21.078 67.8171 20.653 68.2271 20.126C68.6171 19.599 68.924 19.013 69.149 18.368C69.374 17.723 69.4861 17.08 69.4861 16.435H69.485Z" fill="#040000"/>'
        + '<path d="M80.558 1.93402L88.9071 19.276C89.5521 17.91 90.191 16.499 90.826 15.044C91.4611 13.589 92.081 12.129 92.686 10.664C93.311 9.18103 93.9201 7.70601 94.5171 6.24101C95.1121 4.77601 95.722 3.34102 96.347 1.93402C96.542 1.95402 96.694 1.96801 96.801 1.97801C96.908 1.98801 97.011 1.99301 97.109 1.99301H98.4861C98.7011 1.99301 98.925 1.98302 99.16 1.96402C99.375 1.96402 99.5901 1.95902 99.8051 1.94902C100.02 1.93902 100.235 1.93402 100.45 1.93402V2.69601C99.9421 2.69601 99.517 2.72001 99.176 2.76901C98.835 2.81801 98.575 2.91101 98.4 3.04701C98.205 3.20301 98.0631 3.41802 97.9751 3.69202C97.8871 3.96602 97.843 4.33702 97.843 4.80502C97.843 5.97702 97.838 7.15402 97.828 8.33401C97.818 9.51701 97.823 10.703 97.843 11.894C97.843 13.066 97.848 14.233 97.858 15.395C97.868 16.557 97.892 17.685 97.931 18.778C97.931 19.345 97.96 19.808 98.019 20.17C98.078 20.532 98.2141 20.819 98.4291 21.034C98.6441 21.249 98.9611 21.4 99.3811 21.488C99.8011 21.576 100.382 21.62 101.124 21.62V22.382H100.04C99.728 22.382 99.4251 22.372 99.1321 22.353C98.8391 22.353 98.536 22.348 98.224 22.338C97.912 22.328 97.5601 22.323 97.1691 22.323C96.7981 22.323 96.4371 22.328 96.0861 22.338C95.7341 22.348 95.383 22.353 95.031 22.353C94.66 22.353 94.299 22.358 93.947 22.368C93.595 22.378 93.2441 22.383 92.8921 22.383V21.621C93.4001 21.621 93.8391 21.611 94.2101 21.592C94.5801 21.572 94.8931 21.494 95.1481 21.358C95.4011 21.221 95.591 21.002 95.719 20.699C95.845 20.396 95.9091 19.952 95.9091 19.366L95.9971 5.39302H95.938L89.493 20.655C89.317 21.007 89.181 21.334 89.083 21.636C88.985 21.938 88.878 22.276 88.761 22.647H88.175C87.55 21.26 86.9051 19.875 86.2421 18.487C85.5771 17.101 84.9041 15.715 84.2211 14.328L82.156 10.197C81.463 8.81102 80.7741 7.42502 80.0911 6.03802H80.0321L79.7981 16.642C79.7981 16.74 79.7931 16.871 79.7831 17.038C79.7731 17.205 79.7681 17.385 79.7681 17.579V18.487C79.7681 19.21 79.812 19.781 79.9 20.201C79.988 20.621 80.1491 20.929 80.3831 21.124C80.6171 21.339 80.925 21.476 81.306 21.534C81.687 21.592 82.1701 21.622 82.7561 21.622V22.384H81.833C81.53 22.384 81.2321 22.374 80.9391 22.355C80.6271 22.355 80.319 22.35 80.016 22.34C79.713 22.33 79.4151 22.325 79.1221 22.325C78.4771 22.325 77.8281 22.335 77.1741 22.354C76.5201 22.373 75.8711 22.383 75.2271 22.383V21.621C75.7341 21.621 76.198 21.577 76.619 21.489C77.038 21.401 77.394 21.201 77.687 20.888C77.98 20.575 78.214 20.131 78.39 19.555C78.566 18.98 78.673 18.193 78.712 17.198C78.732 16.202 78.761 15.206 78.8 14.21C78.839 13.214 78.878 12.208 78.917 11.192C78.937 10.196 78.961 9.20001 78.99 8.20401C79.019 7.20901 79.0341 6.20301 79.0341 5.18701C79.0341 4.67901 78.9901 4.25902 78.9021 3.92702C78.8141 3.59502 78.6731 3.34102 78.4771 3.16502C78.2621 2.98902 77.9891 2.86701 77.6571 2.79901C77.3251 2.73101 76.926 2.69601 76.457 2.69601V1.93402C76.964 1.95402 77.477 1.96801 77.994 1.97801C78.511 1.98801 79.034 1.99301 79.561 1.99301H79.869C79.937 1.99301 80.0011 1.98302 80.0591 1.96402C80.0981 1.96402 80.1521 1.95902 80.2201 1.94902C80.2881 1.93902 80.402 1.93402 80.558 1.93402Z" fill="#040000"/>'
        + '<path d="M105.164 15.966C105.164 15.028 105.31 14.14 105.603 13.3C105.896 12.46 106.326 11.718 106.892 11.073C107.439 10.448 108.108 9.945 108.899 9.564C109.69 9.183 110.584 8.99298 111.579 8.99298C112.595 8.99298 113.517 9.16 114.348 9.491C115.178 9.824 115.896 10.282 116.501 10.868C117.106 11.473 117.575 12.196 117.907 13.036C118.239 13.876 118.405 14.813 118.405 15.848C118.405 16.805 118.244 17.703 117.922 18.542C117.6 19.382 117.155 20.124 116.589 20.769C116.003 21.394 115.319 21.892 114.538 22.263C113.757 22.634 112.897 22.82 111.96 22.82C110.983 22.82 110.08 22.659 109.251 22.337C108.42 22.015 107.703 21.561 107.098 20.975C106.493 20.371 106.019 19.647 105.677 18.807C105.335 17.968 105.164 17.021 105.164 15.966ZM107.274 15.673C107.274 16.278 107.372 16.952 107.567 17.694C107.762 18.437 108.055 19.13 108.446 19.774C108.837 20.418 109.32 20.961 109.896 21.4C110.471 21.839 111.15 22.059 111.931 22.059C112.654 22.059 113.288 21.873 113.835 21.502C114.382 21.131 114.841 20.652 115.212 20.066C115.564 19.48 115.832 18.841 116.018 18.147C116.204 17.455 116.296 16.786 116.296 16.141C116.296 15.477 116.193 14.769 115.988 14.017C115.783 13.265 115.485 12.577 115.094 11.952C114.703 11.327 114.215 10.806 113.629 10.385C113.043 9.96498 112.369 9.75497 111.608 9.75497C110.866 9.75497 110.226 9.94499 109.69 10.326C109.152 10.707 108.698 11.19 108.328 11.776C107.976 12.362 107.713 13.002 107.537 13.695C107.361 14.388 107.274 15.048 107.274 15.673Z" fill="#040000"/>'
        + '<path d="M123.063 15.966C123.063 15.028 123.209 14.14 123.502 13.3C123.795 12.46 124.225 11.718 124.791 11.073C125.338 10.448 126.007 9.945 126.798 9.564C127.589 9.183 128.483 8.99298 129.478 8.99298C130.494 8.99298 131.416 9.16 132.247 9.491C133.077 9.824 133.795 10.282 134.4 10.868C135.005 11.473 135.474 12.196 135.806 13.036C136.138 13.876 136.304 14.813 136.304 15.848C136.304 16.805 136.143 17.703 135.821 18.542C135.499 19.382 135.054 20.124 134.488 20.769C133.902 21.394 133.218 21.892 132.437 22.263C131.656 22.634 130.796 22.82 129.859 22.82C128.882 22.82 127.979 22.659 127.15 22.337C126.319 22.015 125.602 21.561 124.997 20.975C124.392 20.371 123.918 19.647 123.576 18.807C123.234 17.968 123.063 17.021 123.063 15.966ZM125.172 15.673C125.172 16.278 125.27 16.952 125.465 17.694C125.66 18.437 125.953 19.13 126.344 19.774C126.735 20.418 127.218 20.961 127.794 21.4C128.369 21.839 129.048 22.059 129.829 22.059C130.552 22.059 131.186 21.873 131.733 21.502C132.28 21.131 132.739 20.652 133.11 20.066C133.462 19.48 133.73 18.841 133.916 18.147C134.102 17.455 134.194 16.786 134.194 16.141C134.194 15.477 134.091 14.769 133.886 14.017C133.681 13.265 133.383 12.577 132.992 11.952C132.601 11.327 132.113 10.806 131.527 10.385C130.941 9.96498 130.267 9.75497 129.506 9.75497C128.764 9.75497 128.124 9.94499 127.588 10.326C127.05 10.707 126.596 11.19 126.226 11.776C125.874 12.362 125.611 13.002 125.435 13.695C125.259 14.388 125.172 15.048 125.172 15.673Z" fill="#040000"/>'
        + '<path d="M153.001 0.410995V19.862C153.001 20.467 153.094 20.819 153.279 20.917C153.464 21.015 153.85 21.063 154.436 21.063H154.934V21.649H154.905C154.671 21.708 154.367 21.791 153.997 21.898C153.626 22.005 153.235 22.118 152.825 22.235C152.591 22.313 152.386 22.386 152.21 22.455C152.034 22.524 151.888 22.587 151.771 22.645C151.634 22.704 151.527 22.748 151.449 22.777C151.371 22.806 151.312 22.821 151.273 22.821C151.117 22.821 151.024 22.733 150.995 22.557C150.966 22.381 150.951 22.205 150.951 22.03V20.682H150.892C150.365 21.229 149.657 21.722 148.768 22.161C147.879 22.6 146.996 22.82 146.118 22.82C145.258 22.82 144.511 22.644 143.877 22.293C143.242 21.941 142.7 21.473 142.251 20.887C141.821 20.301 141.499 19.623 141.284 18.851C141.069 18.08 140.962 17.285 140.962 16.464C140.962 15.487 141.133 14.55 141.475 13.652C141.817 12.754 142.29 11.953 142.896 11.25C143.521 10.566 144.258 10.02 145.108 9.60899C145.958 9.19799 146.889 8.994 147.905 8.994C148.374 8.994 148.891 9.03799 149.458 9.12599C150.025 9.21399 150.522 9.34599 150.952 9.52199V4.33701C150.952 3.86801 150.923 3.50201 150.864 3.23801C150.805 2.97401 150.708 2.764 150.571 2.608C150.454 2.471 150.298 2.369 150.102 2.3C149.906 2.231 149.672 2.14899 149.399 2.05099V1.582C149.985 1.406 150.507 1.197 150.966 0.951996C151.425 0.707996 151.811 0.498006 152.123 0.322006C152.201 0.283006 152.274 0.245002 152.343 0.205002C152.411 0.166002 152.475 0.137004 152.533 0.117004C152.572 0.0780044 152.611 0.049007 152.65 0.029007C152.689 0.010007 152.728 0 152.767 0C152.845 0 152.904 0.0400044 152.943 0.117004C152.982 0.195004 153.002 0.293004 153.002 0.410004L153.001 0.410995ZM150.95 19.335V12.627C150.95 12.1 150.833 11.66 150.598 11.309C150.363 10.958 150.071 10.684 149.719 10.489C149.367 10.274 148.996 10.128 148.606 10.05C148.215 9.973 147.864 9.933 147.551 9.933C147.024 9.933 146.483 10.036 145.926 10.241C145.369 10.446 144.866 10.773 144.417 11.222C143.967 11.652 143.597 12.218 143.304 12.921C143.011 13.624 142.874 14.464 142.894 15.441C142.894 17.179 143.348 18.575 144.256 19.629C145.164 20.683 146.351 21.211 147.815 21.211C148.03 21.211 148.313 21.167 148.665 21.079C149.017 20.991 149.358 20.859 149.69 20.683C150.042 20.527 150.339 20.331 150.584 20.097C150.829 19.863 150.95 19.61 150.95 19.335Z" fill="#040000"/>'
        + '</svg>';
}

/** PC 브레이크포인트 기준 품목 → 페이지 분할 (invoice-detail-grid.js splitItemsIntoPages 동일 규칙) */
const MAX_ROWS_BEFORE_SEPARATOR_TRIGGER = 5;
const MAX_ROWS_BEFORE_FOOTER_TRIGGER = 13;

function splitItemsIntoPagesPC(items) {
    if (!items || items.length === 0) {
        return [{ items: [], useExtendedItemsArea: false, hasSummary: true }];
    }
    const pages = [];
    let currentPage = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const wouldExceedFooter = (currentPage.length + 1) > MAX_ROWS_BEFORE_FOOTER_TRIGGER;
        if (wouldExceedFooter && currentPage.length > 0) {
            const ext = currentPage.length > MAX_ROWS_BEFORE_SEPARATOR_TRIGGER;
            pages.push({ items: currentPage.slice(), useExtendedItemsArea: ext, hasSummary: false });
            currentPage = [];
        }
        currentPage.push(item);
        if (i === items.length - 1) {
            const isExtended = currentPage.length > MAX_ROWS_BEFORE_SEPARATOR_TRIGGER;
            if (isExtended) {
                pages.push({ items: currentPage.slice(), useExtendedItemsArea: true, hasSummary: false });
                pages.push({ items: [], useExtendedItemsArea: false, hasSummary: true });
            } else {
                pages.push({ items: currentPage.slice(), useExtendedItemsArea: false, hasSummary: true });
            }
            currentPage = [];
        }
    }
    if (currentPage.length > 0) {
        const ext = currentPage.length > MAX_ROWS_BEFORE_SEPARATOR_TRIGGER;
        if (ext) {
            pages.push({ items: currentPage.slice(), useExtendedItemsArea: true, hasSummary: false });
            pages.push({ items: [], useExtendedItemsArea: false, hasSummary: true });
        } else {
            pages.push({ items: currentPage.slice(), useExtendedItemsArea: false, hasSummary: true });
        }
    }
    return pages;
}

/** 한 페이지 분량 HTML 문자열 (createPageHTML과 동일 구조, warranty 컬럼 없음) */
function createPageHTMLString(pageData, inv, pageNumber) {
    const items = pageData.items || [];
    const useExtended = !!pageData.useExtendedItemsArea;
    const hasSummary = !!pageData.hasSummary;
    let payload = null;
    if (inv.payload_json) {
        try {
            payload = typeof inv.payload_json === 'string' ? JSON.parse(inv.payload_json) : inv.payload_json;
        } catch (e) { /* ignore */ }
    }
    const currency = inv.currency || (payload && payload.currency) || 'KRW';
    const issued = formatIssueDate(inv.issued_at || inv.issuedAt);
    const invoiceNumber = escapeHtml(String(inv.invoice_number || inv.invoiceNumber || 'N/A'));
    const billing = (payload && payload.billing) || {};
    const shipping = (payload && payload.shipping) || {};
    const subtotal = inv.net_amount != null ? inv.net_amount : (payload && payload.amounts && payload.amounts.net) || 0;
    const tax = inv.tax_amount != null ? inv.tax_amount : (payload && payload.amounts && payload.amounts.tax) || 0;
    const total = inv.total_amount != null ? inv.total_amount : (payload && payload.amounts && payload.amounts.total) || 0;
    const paymentMethod = escapeHtml(String(inv.payment_method || inv.paymentMethod || 'Credit Card'));
    const custName = escapeHtml(String(inv.billing_name || inv.shipping_name || billing.name || shipping.name || 'N/A'));
    const membershipId = escapeHtml(String(inv.membership_id || inv.membershipId || 'N/A'));
    const custAddr = maskEmail(String(inv.billing_email || inv.shipping_email || billing.email || shipping.email || 'N/A'));

    const rowsHtml = items.map(it => {
        const name = escapeHtml(it.product_short_name || it.product_name || 'N/A');
        const qty = it.quantity || 0;
        const amt = parseFloat(it.subtotal, 10) || 0;
        const cur = it.currency || currency;
        return '<tr><td>' + name + '</td><td>*' + qty + '</td><td>' + formatCurrency(amt, cur) + '</td></tr>';
    }).join('');
    const tableBody = rowsHtml
        ? '<tbody>' + rowsHtml + '</tbody>'
        : '<tbody><tr><td colspan="3">주문 항목이 없습니다.</td></tr></tbody>';

    const headerHtml = '<div class="grid-header invoice-detail-header">'
        + '<div class="invoice-header-left">'
        + '<h1 class="invoice-header-title">INVOICE</h1>'
        + '<div class="invoice-header-meta">'
        + '<div>INVOICE NO. ' + invoiceNumber + '</div>'
        + '<div>ISSUE DATE : ' + escapeHtml(issued) + '</div>'
        + '</div></div>'
        + '<div class="invoice-header-right">' + getLogoSvg() + '</div></div>';

    const sepHeaderHtml = '<div class="grid-sep grid-sep-header"><div class="grid-sep-inner"></div></div>';
    const itemsHtml = '<div class="grid-items">'
        + '<h2 class="invoice-section-title">DESCRIPTION</h2>'
        + '<table class="invoice-items-table"><thead><tr><th>상품명</th><th>수량</th><th>금액</th></tr></thead>' + tableBody + '</table></div>';
    const sepFooterHtml = '<div class="grid-sep grid-sep-footer"><div class="grid-sep-inner"></div></div>';

    const footerHtml = '<div class="grid-footer invoice-detail-footer">'
        + '<div class="invoice-footer-section"><h3 class="invoice-footer-title">PRE.PMOOD</h3><div class="invoice-footer-info">'
        + '<div class="invoice-footer-row"><span class="invoice-footer-label">COMPANY NAME</span><span class="invoice-footer-value">PRE.PMOOD</span></div>'
        + '<div class="invoice-footer-row"><span class="invoice-footer-label">BUSINESS ADDRESS</span><span class="invoice-footer-value">Online Boutique</span></div>'
        + '<div class="invoice-footer-row"><span class="invoice-footer-label">EMAIL</span><span class="invoice-footer-value">clientcare@prepmood.kr</span></div></div></div>'
        + '<div class="invoice-footer-section"><h3 class="invoice-footer-title">CUSTOMER</h3><div class="invoice-footer-info">'
        + '<div class="invoice-footer-row"><span class="invoice-footer-label">NAME</span><span class="invoice-footer-value">' + custName + '</span></div>'
        + '<div class="invoice-footer-row"><span class="invoice-footer-label">ID</span><span class="invoice-footer-value">' + membershipId + '</span></div>'
        + '<div class="invoice-footer-row"><span class="invoice-footer-label">ADDRESS</span><span class="invoice-footer-value">' + custAddr + '</span></div></div></div></div>';

    const sepPriceCls = 'grid-sep grid-sep-price' + (hasSummary ? '' : ' grid-sep-hidden');
    const sepPriceHtml = '<div class="' + sepPriceCls + '"><div class="grid-sep-inner"></div></div>';
    const summaryCls = 'grid-summary' + (hasSummary ? '' : ' grid-summary-hidden');
    const summaryHtml = '<div class="' + summaryCls + '">'
        + '<div class="invoice-summary-container">'
        + '<div class="invoice-summary-row"><span class="invoice-summary-label">Subtotal</span><span class="invoice-summary-value">' + formatCurrency(subtotal, currency) + '</span></div>'
        + '<div class="invoice-summary-row"><span class="invoice-summary-label">Tax</span><span class="invoice-summary-value">' + formatCurrency(tax, currency) + '</span></div>'
        + '<div class="invoice-summary-row"><span class="invoice-summary-label">Payment Method</span><span class="invoice-summary-value">' + paymentMethod + '</span></div>'
        + '<div class="invoice-summary-row total"><span class="invoice-summary-label">Total</span><span class="invoice-summary-value">' + formatCurrency(total, currency) + '</span></div>'
        + '</div></div>';

    const cls = 'invoice-page' + (useExtended ? ' extended-items' : '');
    let inner;
    if (useExtended) {
        inner = headerHtml + sepHeaderHtml + itemsHtml + sepFooterHtml + footerHtml;
    } else {
        inner = headerHtml + sepHeaderHtml + itemsHtml + sepPriceHtml + summaryHtml + sepFooterHtml + footerHtml;
    }
    return '<div class="' + cls + '" data-page="' + pageNumber + '">' + inner + '</div>';
}

/**
 * 인보이스 데이터 → 전체 HTML 문서 문자열 (Puppeteer setContent용)
 * @param {Object} invoiceRow - DB 인보이스 행 (payload_json, invoice_number, billing_*, shipping_*, total_amount, issued_at 등)
 * @returns {string} 완전한 HTML 문서 (UTF-8, PC 스타일 인라인)
 */
function generateInvoiceHtml(invoiceRow) {
    let payload = null;
    if (invoiceRow.payload_json) {
        try {
            payload = typeof invoiceRow.payload_json === 'string'
                ? JSON.parse(invoiceRow.payload_json) : invoiceRow.payload_json;
        } catch (e) { /* ignore */ }
    }
    const items = (payload && Array.isArray(payload.items)) ? payload.items : [];
    const pages = splitItemsIntoPagesPC(items);
    const pagesHtml = pages.map((p, idx) => createPageHTMLString(p, invoiceRow, idx + 1)).join('');
    return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=751.4">'
        + '<style>' + INVOICE_PC_CSS + '</style></head><body>' + pagesHtml + '</body></html>';
}

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
            if (HAS_KOREAN_FONT) {
                doc.registerFont('KoreanFont', FONT_KR_PATH);
                doc.font('KoreanFont');
            } else {
                Logger.warn('[INVOICE_PDF] pdfkit 폴백: 한글 폰트 없음. 한글이 깨질 수 있음.', { tried: FONT_KR_CANDIDATES });
            }
            const payload = (invoiceRow.payload_json && typeof invoiceRow.payload_json === 'object')
                ? invoiceRow.payload_json
                : (typeof invoiceRow.payload_json === 'string' ? JSON.parse(invoiceRow.payload_json) : null);
            const invoiceNumber = invoiceRow.invoice_number || '-';
            const issuedAt = invoiceRow.issued_at
                ? new Date(invoiceRow.issued_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
                : '-';
            const totalAmount = invoiceRow.total_amount != null ? Number(invoiceRow.total_amount) : (payload?.amounts?.total ?? 0);
            const currency = (invoiceRow.currency || (payload && payload.amounts && payload.amounts.currency)) || 'KRW';
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

/** Puppeteer PDF 생성 (동시 제한·타임아웃·browser.close 보장). 실패 시 호출부에서 폴백. */
const PUPPETEER_LAUNCH_TIMEOUT_MS = 30000;
const PUPPETEER_SET_CONTENT_TIMEOUT_MS = 15000;
const PUPPETEER_PDF_TIMEOUT_MS = 20000;

async function generateInvoicePdfBufferPuppeteer(invoiceRow) {
    await pdfAcquire();
    let browser;
    try {
        const puppeteer = require('puppeteer');
        const html = generateInvoiceHtml(invoiceRow);
        const launchArgs = [
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-software-rasterizer',
            '--no-first-run',
            '--no-zygote'
        ];
        if (process.env.PUPPETEER_NO_SANDBOX === 'true' || (process.platform === 'linux' && process.getuid && process.getuid() === 0)) {
            launchArgs.push('--no-sandbox', '--disable-setuid-sandbox');
        }
        browser = await puppeteer.launch({
            headless: true,
            args: launchArgs,
            timeout: PUPPETEER_LAUNCH_TIMEOUT_MS
        });
        const page = await browser.newPage();
        await page.setContent(html, {
            waitUntil: 'load',
            timeout: PUPPETEER_SET_CONTENT_TIMEOUT_MS
        });
        const pdfBytes = await page.pdf({
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
            preferCSSPageSize: true,
            timeout: PUPPETEER_PDF_TIMEOUT_MS
        });
        return Buffer.from(pdfBytes);
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (closeErr) {
                Logger.warn('[INVOICE_PDF] Puppeteer browser.close 실패', { error: closeErr.message });
            }
        }
        pdfRelease();
    }
}

/**
 * 인보이스 PDF 버퍼 생성 (Puppeteer 우선, 실패 시 pdfkit 폴백)
 * @param {Object} invoiceRow - DB 인보이스 행
 * @returns {Promise<Buffer>}
 */
async function generateInvoicePdfBufferPreferred(invoiceRow) {
    try {
        return await generateInvoicePdfBufferPuppeteer(invoiceRow);
    } catch (err) {
        Logger.warn('[INVOICE_PDF] Puppeteer PDF 실패, pdfkit 폴백. 원인:', err.message);
        Logger.warn('[INVOICE_PDF] stack:', err.stack);
        return await generateInvoicePdfBuffer(invoiceRow);
    }
}

module.exports = {
    generateInvoicePdfBuffer,
    generateInvoicePdfBufferPreferred,
    generateInvoiceHtml
};
