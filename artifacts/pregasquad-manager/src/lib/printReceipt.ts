import { isQzConnected, silentPrint, silentPrintExpense, remotePrint, remotePrintExpense, remoteOpenDrawer, openCashDrawer, checkPrintStationAsync, ensureQzConnected } from "./qzPrint";

function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
}

function printViaMobileOverlay(receiptHtml: string): void {
  const existing = document.getElementById("__receipt_mobile_overlay__");
  if (existing) existing.remove();

  // Inject print-only style to hide everything except the overlay
  const styleId = "__receipt_print_style__";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `@media print { body > *:not(#__receipt_mobile_overlay__) { display: none !important; } #__receipt_mobile_overlay__ .overlay-bg { display: none !important; } #__receipt_mobile_overlay__ .overlay-card { box-shadow: none !important; margin: 0 !important; max-height: none !important; overflow: visible !important; } #__receipt_mobile_overlay__ .overlay-actions { display: none !important; } }`;
    document.head.appendChild(style);
  }

  const overlay = document.createElement("div");
  overlay.id = "__receipt_mobile_overlay__";
  overlay.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;";

  overlay.innerHTML = `
    <div class="overlay-bg" style="position:absolute;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(2px);"></div>
    <div class="overlay-card" style="position:relative;z-index:1;background:#fff;border-radius:12px 12px 0 0;width:100%;max-width:400px;margin-top:auto;max-height:90vh;overflow-y:auto;padding:0 0 8px 0;box-shadow:0 -4px 32px rgba(0,0,0,0.25);">
      <div class="overlay-actions" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px 8px;border-bottom:1px solid #eee;gap:8px;position:sticky;top:0;background:#fff;z-index:2;">
        <button id="__receipt_close_btn__" style="padding:8px 18px;border:1px solid #ddd;border-radius:8px;background:#fff;font-size:14px;cursor:pointer;font-weight:500;">✕ إغلاق</button>
        <button id="__receipt_print_btn__" style="padding:8px 22px;border:none;border-radius:8px;background:#d63384;color:#fff;font-size:15px;font-weight:700;cursor:pointer;flex:1;max-width:180px;">🖨️ طباعة</button>
      </div>
      <div style="padding:0 12px 12px;">${receiptHtml}</div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeOverlay = () => {
    overlay.remove();
    const style = document.getElementById(styleId);
    if (style) style.remove();
  };

  overlay.querySelector("#__receipt_close_btn__")?.addEventListener("click", closeOverlay);
  overlay.querySelector(".overlay-bg")?.addEventListener("click", closeOverlay);

  overlay.querySelector("#__receipt_print_btn__")?.addEventListener("click", () => {
    window.print();
  });
}

function printViaIframe(html: string): void {
  if (isMobileDevice()) {
    // Extract just the <body> content to embed cleanly in the overlay
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : html;

    // Extract styles to keep the receipt looking correct
    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const receiptHtml = styleMatch
      ? `<style>${styleMatch[1]}</style>${bodyContent}`
      : bodyContent;

    printViaMobileOverlay(receiptHtml);
    return;
  }

  const existingFrame = document.getElementById("__receipt_print_frame__");
  if (existingFrame) existingFrame.remove();

  const iframe = document.createElement("iframe");
  iframe.id = "__receipt_print_frame__";
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;

  doc.open();
  doc.write(html);
  doc.close();

  let printed = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  const doPrint = () => {
    if (printed) return;
    printed = true;
    if (fallbackTimer) clearTimeout(fallbackTimer);
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error("[print] iframe print failed:", e);
    }
    setTimeout(() => iframe.remove(), 3000);
  };

  if (iframe.contentDocument?.readyState === "complete") {
    doPrint();
  } else {
    iframe.onload = doPrint;
    fallbackTimer = setTimeout(doPrint, 800);
  }
}

export interface ReceiptData {
  businessName: string;
  currency: string;
  clientName: string;
  clientPhone?: string;
  services: string;
  staffName: string;
  date: string;
  time: string;
  duration: number;
  total: number;
  paid?: boolean;
  appointmentId?: number;
  loyaltyPointsEarned?: number;
  loyaltyPointsBalance?: number;
}

export async function autoPrint(data: ReceiptData): Promise<void> {
  // 1. QZ Tray already connected on this device — fully silent
  if (isQzConnected()) {
    await silentPrint(data);
    setTimeout(() => openCashDrawer(), 800);
    return;
  }

  // 2. Try to connect QZ Tray (reuses any in-progress attempt)
  const qzOk = await ensureQzConnected();
  if (qzOk && isQzConnected()) {
    console.log("[print] QZ connected on retry, printing silently");
    await silentPrint(data);
    setTimeout(() => openCashDrawer(), 800);
    return;
  }

  // 3. Relay to a remote print station (e.g. tablet → desktop with QZ)
  const stationAvailable = await checkPrintStationAsync();
  if (stationAvailable) {
    console.log("[print-relay] Remote print station found, sending receipt");
    await remotePrint(data);
    setTimeout(() => remoteOpenDrawer(), 800);
    return;
  }

  // 4. No printer available — skip silently (no popup, no dialog)
  console.log("[print] No printer available — skipping receipt print silently");
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function browserPrint(data: ReceiptData): void {
  const e = escapeHtml;
  const now = new Date();
  const timestamp = now.toLocaleDateString("fr-FR") + " " + now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  const serviceLines = data.services.split(",").map(s => s.trim()).filter(Boolean);
  const servicesHtml = serviceLines.map(s => `<div class="svc-item">${e(s)}</div>`).join("");

  let loyaltyHtml = "";
  if (
    (data.loyaltyPointsEarned !== undefined && data.loyaltyPointsEarned > 0) ||
    (data.loyaltyPointsBalance !== undefined && data.loyaltyPointsBalance > 0)
  ) {
    loyaltyHtml = `<div class="sep-single"></div>
      <div class="section-title">Fidelite / نقاط الولاء</div>`;
    if (data.loyaltyPointsEarned !== undefined && data.loyaltyPointsEarned > 0) {
      loyaltyHtml += `<div class="row"><span>Points gagnes / نقاط</span><span>+${data.loyaltyPointsEarned}</span></div>`;
    }
    if (data.loyaltyPointsBalance !== undefined && data.loyaltyPointsBalance > 0) {
      loyaltyHtml += `<div class="row"><span>Solde / رصيد</span><span>${data.loyaltyPointsBalance}</span></div>`;
    }
  }

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt</title>
<style>
  @page {
    margin: 0;
    padding: 0;
    size: 80mm auto;
  }
  @media print {
    html, body { width: 80mm; }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', 'Lucida Console', monospace;
    font-size: 13px;
    line-height: 1.2;
    width: 72mm;
    max-width: 72mm;
    margin: 0 auto;
    padding: 2mm 0;
    color: #000;
    background: #fff;
  }
  .biz-name {
    text-align: center;
    font-size: 20px;
    font-weight: bold;
    letter-spacing: 1px;
    padding: 1mm 0;
  }
  .sep-double {
    border-top: 3px double #000;
    margin: 1mm 0;
  }
  .sep-single {
    border-top: 1px dashed #000;
    margin: 1mm 0;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 2mm;
    padding: 0.3mm 0;
  }
  .row span:first-child {
    color: #333;
  }
  .row span:last-child {
    font-weight: 600;
    text-align: right;
  }
  .section-title {
    font-weight: bold;
    padding: 1mm 0;
    font-size: 13px;
  }
  .svc-item {
    padding: 0.3mm 0 0.3mm 3mm;
  }
  .total-box {
    text-align: center;
    padding: 3mm 0;
    margin: 1mm 0;
    border-top: 2px solid #000;
    border-bottom: 2px solid #000;
  }
  .total-label {
    font-size: 13px;
    font-weight: bold;
    letter-spacing: 1px;
  }
  .total-amount {
    font-size: 22px;
    font-weight: bold;
    letter-spacing: 1px;
  }
  .footer {
    text-align: center;
    margin-top: 3mm;
    font-size: 12px;
    color: #333;
  }
  .footer .thanks {
    font-size: 14px;
    font-weight: bold;
    margin-bottom: 1mm;
  }
</style>
</head>
<body>
  <div class="biz-name">${e(data.businessName)}</div>
  <div class="sep-double"></div>

  <div class="row"><span>Date:</span><span>${e(data.date)}</span></div>
  <div class="row"><span>Heure / الوقت:</span><span>${e(data.time)}</span></div>
  ${data.appointmentId ? `<div class="row"><span>Ticket #:</span><span>${data.appointmentId}</span></div>` : ""}
  <div class="sep-single"></div>

  <div class="row"><span>Client(e) / العميل:</span><span>${e(data.clientName)}</span></div>
  ${data.clientPhone ? `<div class="row"><span>Tel / الهاتف:</span><span>${e(data.clientPhone)}</span></div>` : ""}
  <div class="row"><span>Staff / الموظف:</span><span>${e(data.staffName)}</span></div>
  <div class="sep-single"></div>

  <div class="section-title">Services / الخدمات:</div>
  ${servicesHtml}
  <div class="row"><span>Duree / المدة:</span><span>${data.duration} min</span></div>

  <div class="total-box">
    <div class="total-label">TOTAL / المجموع</div>
    <div class="total-amount">${data.total.toFixed(2)} ${e(data.currency)}</div>
    ${data.paid !== undefined ? `<div class="paid-status" style="margin-top:2mm;font-size:13px;font-weight:bold;letter-spacing:2px;color:${data.paid ? '#000' : '#555'};">${data.paid ? '✓ PAYÉ / مدفوع' : '◻ NON PAYÉ / غير مدفوع'}</div>` : ""}
  </div>

  ${loyaltyHtml}

  <div class="sep-double"></div>
  <div class="footer">
    <div class="thanks">Merci de votre visite!</div>
    <div>شكرا لزيارتكم</div>
    <div style="margin-top:1mm">Tel: 0635198816</div>
    <div>IG: @pregasquad.women</div>
    <div style="margin-top:1mm">${e(timestamp)}</div>
  </div>
</body>
</html>`;

  printViaIframe(html);
}

export interface ExpenseReceiptData {
  businessName: string;
  currency: string;
  expenseType: string;
  expenseName: string;
  amount: number;
  date: string;
}

export async function autoPrintExpense(data: ExpenseReceiptData): Promise<void> {
  // 1. QZ Tray already connected on this device — fully silent
  if (isQzConnected()) {
    await silentPrintExpense(data);
    return;
  }

  // 2. Try to connect QZ Tray
  const qzOk = await ensureQzConnected();
  if (qzOk && isQzConnected()) {
    console.log("[print] QZ connected on retry, printing expense silently");
    await silentPrintExpense(data);
    return;
  }

  // 3. Relay to remote print station
  const stationAvailable = await checkPrintStationAsync();
  if (stationAvailable) {
    console.log("[print-relay] Remote print station found, sending expense receipt");
    await remotePrintExpense(data);
    return;
  }

  // 4. No printer — skip silently
  console.log("[print] No printer available — skipping expense print silently");
}

function browserPrintExpense(data: ExpenseReceiptData): void {
  const e = escapeHtml;
  const now = new Date();
  const timestamp = now.toLocaleDateString("fr-FR") + " " + now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Expense Receipt</title>
<style>
  @page {
    margin: 0;
    padding: 0;
    size: 80mm auto;
  }
  @media print {
    html, body { width: 80mm; }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', 'Lucida Console', monospace;
    font-size: 13px;
    line-height: 1.2;
    width: 72mm;
    max-width: 72mm;
    margin: 0 auto;
    padding: 2mm 0;
    color: #000;
    background: #fff;
  }
  .biz-name {
    text-align: center;
    font-size: 20px;
    font-weight: bold;
    letter-spacing: 1px;
    padding: 1mm 0;
  }
  .sep-double {
    border-top: 3px double #000;
    margin: 1mm 0;
  }
  .sep-single {
    border-top: 1px dashed #000;
    margin: 1mm 0;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 2mm;
    padding: 0.3mm 0;
  }
  .row span:first-child {
    color: #333;
  }
  .row span:last-child {
    font-weight: 600;
    text-align: right;
  }
  .title {
    text-align: center;
    font-weight: bold;
    font-size: 15px;
    padding: 1mm 0;
  }
  .total-box {
    text-align: center;
    padding: 3mm 0;
    margin: 1mm 0;
    border-top: 2px solid #000;
    border-bottom: 2px solid #000;
  }
  .total-label {
    font-size: 13px;
    font-weight: bold;
    letter-spacing: 1px;
  }
  .total-amount {
    font-size: 22px;
    font-weight: bold;
    letter-spacing: 1px;
  }
  .footer {
    text-align: center;
    margin-top: 3mm;
    font-size: 12px;
    color: #333;
  }
</style>
</head>
<body>
  <div class="biz-name">${e(data.businessName)}</div>
  <div class="sep-double"></div>

  <div class="title">RECU DE DEPENSE / ايصال مصروف</div>
  <div class="sep-single"></div>

  <div class="row"><span>Date:</span><span>${e(data.date)}</span></div>
  <div class="row"><span>Heure / الوقت:</span><span>${e(timestamp.split(" ")[1] || "")}</span></div>
  <div class="sep-single"></div>

  <div class="row"><span>Categorie / الفئة:</span><span>${e(data.expenseType)}</span></div>
  <div class="row"><span>Description / الوصف:</span><span>${e(data.expenseName)}</span></div>

  <div class="total-box">
    <div class="total-label">MONTANT / المبلغ</div>
    <div class="total-amount">${data.amount.toFixed(2)} ${e(data.currency)}</div>
  </div>

  <div class="sep-double"></div>
  <div class="footer">
    <div>${e(timestamp)}</div>
  </div>
</body>
</html>`;

  printViaIframe(html);
}
