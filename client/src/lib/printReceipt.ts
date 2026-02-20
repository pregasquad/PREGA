import { isQzConnected, silentPrint, silentPrintExpense, remotePrint, remotePrintExpense, remoteOpenDrawer, checkPrintStationAsync, ensureQzConnected } from "./qzPrint";

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
  appointmentId?: number;
  loyaltyPointsEarned?: number;
  loyaltyPointsBalance?: number;
}

export async function autoPrint(data: ReceiptData): Promise<void> {
  if (isQzConnected()) {
    await silentPrint(data);
    return;
  }

  const qzOk = await ensureQzConnected();
  if (qzOk && isQzConnected()) {
    console.log("[print] QZ connected on retry, printing silently");
    await silentPrint(data);
    return;
  }

  const stationAvailable = await checkPrintStationAsync();
  if (stationAvailable) {
    console.log("[print-relay] Remote print station found, sending receipt");
    await remotePrint(data);
    return;
  }
  console.log("[print-relay] No print station available, using browser print");
  browserPrint(data);
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

  const printWindow = window.open("", "_blank", "width=320,height=600");
  if (!printWindow) return;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };

  setTimeout(() => {
    if (printWindow.document.readyState === "complete") {
      printWindow.focus();
      printWindow.print();
    }
  }, 600);
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
  if (isQzConnected()) {
    await silentPrintExpense(data);
    return;
  }

  const qzOk = await ensureQzConnected();
  if (qzOk && isQzConnected()) {
    console.log("[print] QZ connected on retry, printing expense silently");
    await silentPrintExpense(data);
    return;
  }

  const stationAvailable = await checkPrintStationAsync();
  if (stationAvailable) {
    console.log("[print-relay] Remote print station found, sending expense receipt");
    await remotePrintExpense(data);
    return;
  }
  console.log("[print-relay] No print station available, using browser print for expense");
  browserPrintExpense(data);
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

  const printWindow = window.open("", "_blank", "width=320,height=600");
  if (!printWindow) return;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };

  setTimeout(() => {
    if (printWindow.document.readyState === "complete") {
      printWindow.focus();
      printWindow.print();
    }
  }, 600);
}
