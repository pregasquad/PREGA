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
}

export function printReceipt(data: ReceiptData) {
  const printWindow = window.open("", "_blank", "width=320,height=600");
  if (!printWindow) return;

  const receiptHTML = `
<!DOCTYPE html>
<html dir="ltr">
<head>
<meta charset="utf-8"/>
<title>Receipt</title>
<style>
  @page { margin: 0; size: 80mm auto; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    width: 80mm;
    padding: 4mm;
    color: #000;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .salon-name { font-size: 16px; font-weight: bold; margin-bottom: 4px; }
  .divider {
    border-top: 1px dashed #000;
    margin: 6px 0;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 4px;
    padding: 2px 0;
  }
  .row .label { color: #333; flex-shrink: 0; }
  .row .value { text-align: right; word-break: break-word; }
  .total-row {
    display: flex;
    justify-content: space-between;
    font-size: 16px;
    font-weight: bold;
    padding: 4px 0;
  }
  .footer { margin-top: 8px; font-size: 10px; color: #666; }
  .services-list { padding: 2px 0; word-break: break-word; }
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
  
  <div class="divider"></div>
  
  <div class="center footer">
    Thank you / شكراً
    <br/>
    ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
  </div>

  <script>
    window.onload = function() {
      window.print();
      setTimeout(function() { window.close(); }, 1000);
    };
  </script>
</body>
</html>`;

  printWindow.document.write(receiptHTML);
  printWindow.document.close();
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
