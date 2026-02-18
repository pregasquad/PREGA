interface ReceiptData {
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

export function openReceiptWindow(): Window | null {
  const printWindow = window.open("", "_blank", "width=400,height=700");
  if (printWindow) {
    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head><body><p style="text-align:center;padding:20px;font-family:Arial,sans-serif;font-size:14px">Preparing receipt...</p></body></html>`);
  }
  return printWindow;
}

export function printReceipt(data: ReceiptData, existingWindow?: Window | null) {
  const printWindow = existingWindow || window.open("", "_blank", "width=400,height=700");
  if (!printWindow) return;

  const loyaltySection = (data.loyaltyPointsEarned !== undefined && data.loyaltyPointsEarned > 0) || (data.loyaltyPointsBalance !== undefined && data.loyaltyPointsBalance > 0) ? `
  <div class="divider"></div>
  <div class="loyalty-section">
    <div class="row">
      <span class="label bold">Fidélité / نقاط الولاء</span>
    </div>
    ${data.loyaltyPointsEarned !== undefined && data.loyaltyPointsEarned > 0 ? `
    <div class="row">
      <span class="label">Points earned / مكتسبة:</span>
      <span class="value bold">+${data.loyaltyPointsEarned}</span>
    </div>` : ""}
    ${data.loyaltyPointsBalance !== undefined ? `
    <div class="row">
      <span class="label">Balance / الرصيد:</span>
      <span class="value bold">${data.loyaltyPointsBalance}</span>
    </div>` : ""}
  </div>` : "";

  const receiptHTML = `
<!DOCTYPE html>
<html dir="ltr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Receipt</title>
<style>
  @page { margin: 0; size: 80mm auto; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    width: 80mm;
    padding: 5mm;
    color: #000;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .salon-name {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .divider {
    border: none;
    border-top: 1px dashed #000;
    margin: 8px 0;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    padding: 3px 0;
    font-size: 13px;
  }
  .row .label { color: #000; flex-shrink: 0; font-weight: 500; }
  .row .value { text-align: right; word-break: break-word; }
  .total-row {
    display: flex;
    justify-content: space-between;
    font-size: 18px;
    font-weight: 700;
    padding: 6px 0;
    letter-spacing: 0.3px;
  }
  .footer {
    margin-top: 10px;
    font-size: 11px;
    color: #444;
    line-height: 1.5;
  }
  .services-list {
    padding: 3px 0;
    word-break: break-word;
    font-size: 13px;
  }
  .loyalty-section { padding: 3px 0; }
  .loyalty-section .row .label { font-size: 12px; }
  .loyalty-section .row .value { font-size: 13px; }
  @media print {
    body { width: 80mm; padding: 3mm; }
  }
</style>
</head>
<body>
  <div class="center">
    <div class="salon-name">${escapeHtml(data.businessName)}</div>
  </div>
  <div class="divider"></div>

  <div class="row">
    <span class="label">Date:</span>
    <span class="value">${escapeHtml(data.date)}</span>
  </div>
  <div class="row">
    <span class="label">Time:</span>
    <span class="value">${escapeHtml(data.time)}</span>
  </div>
  ${data.appointmentId ? `<div class="row"><span class="label">#</span><span class="value">${data.appointmentId}</span></div>` : ""}

  <div class="divider"></div>

  <div class="row">
    <span class="label">Client:</span>
    <span class="value">${escapeHtml(data.clientName)}</span>
  </div>
  ${data.clientPhone ? `<div class="row"><span class="label">Phone:</span><span class="value">${escapeHtml(data.clientPhone)}</span></div>` : ""}
  <div class="row">
    <span class="label">Staff:</span>
    <span class="value">${escapeHtml(data.staffName)}</span>
  </div>

  <div class="divider"></div>

  <div class="row">
    <span class="label bold">Services:</span>
  </div>
  <div class="services-list">${escapeHtml(data.services)}</div>
  <div class="row">
    <span class="label">Duration:</span>
    <span class="value">${data.duration} min</span>
  </div>

  <div class="divider"></div>

  <div class="total-row">
    <span>TOTAL</span>
    <span>${data.total.toFixed(2)} ${escapeHtml(data.currency)}</span>
  </div>

  ${loyaltySection}

  <div class="divider"></div>

  <div class="center footer">
    Thank you / شكراً
    <br/>
    ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
  </div>

  <style media="print">
    #cash-drawer-cmd { display: block !important; }
  </style>
  <span id="cash-drawer-cmd" style="display:none;position:absolute;overflow:hidden;width:0;height:0;font-size:0;line-height:0;">\x1Bp\x00\x19\xFA</span>

  <script>
    window.onload = function() {
      window.print();
      setTimeout(function() { window.close(); }, 1000);
    };
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(receiptHTML);
  printWindow.document.close();
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
