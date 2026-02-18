import { isQzConnected, silentPrint } from "./qzPrint";

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
  browserPrint(data);
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function padRow(label: string, value: string, width = 40): string {
  const gap = width - label.length - value.length;
  if (gap > 0) {
    return label + "\u00A0".repeat(gap) + value;
  }
  return label + " " + value;
}

function browserPrint(data: ReceiptData): void {
  const e = escapeHtml;
  const now = new Date();
  const timestamp = now.toLocaleDateString() + " " + now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  let loyaltyHtml = "";
  if (
    (data.loyaltyPointsEarned !== undefined && data.loyaltyPointsEarned > 0) ||
    (data.loyaltyPointsBalance !== undefined && data.loyaltyPointsBalance > 0)
  ) {
    loyaltyHtml = `
      <div class="sep">--------------------------------</div>
      <div class="bold">Fidelite / نقاط الولاء</div>`;
    if (data.loyaltyPointsEarned !== undefined && data.loyaltyPointsEarned > 0) {
      loyaltyHtml += `<div class="row"><span>Points / نقاط:</span><span>+${data.loyaltyPointsEarned}</span></div>`;
    }
    if (data.loyaltyPointsBalance !== undefined && data.loyaltyPointsBalance > 0) {
      loyaltyHtml += `<div class="row"><span>Solde / رصيد:</span><span>${data.loyaltyPointsBalance}</span></div>`;
    }
  }

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
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
  .big { font-size: 16px; font-weight: bold; }
  .sep { text-align: center; letter-spacing: 1px; margin: 2px 0; }
  .row { display: flex; justify-content: space-between; gap: 4px; }
  .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin: 4px 0; }
  .footer { text-align: center; margin-top: 8px; font-size: 11px; }
  .rtl { direction: rtl; text-align: right; }
</style>
</head>
<body>
  <div class="center big">${e(data.businessName)}</div>
  <div class="sep">================================</div>

  <div class="row"><span>Date:</span><span>${e(data.date)}</span></div>
  <div class="row"><span>Heure / الوقت:</span><span>${e(data.time)}</span></div>
  ${data.appointmentId ? `<div class="row"><span>#:</span><span>${data.appointmentId}</span></div>` : ""}
  <div class="sep">--------------------------------</div>

  <div class="row"><span>Client(e) / العميل:</span><span>${e(data.clientName)}</span></div>
  ${data.clientPhone ? `<div class="row"><span>Tel / الهاتف:</span><span>${e(data.clientPhone)}</span></div>` : ""}
  <div class="row"><span>Staff / الموظف:</span><span>${e(data.staffName)}</span></div>
  <div class="sep">--------------------------------</div>

  <div class="bold">Services / الخدمات:</div>
  <div>${e(data.services)}</div>
  <div class="row"><span>Duree / المدة:</span><span>${data.duration} min</span></div>
  <div class="sep">================================</div>

  <div class="total-row"><span>TOTAL / المجموع</span><span>${data.total.toFixed(2)} ${e(data.currency)}</span></div>

  ${loyaltyHtml}

  <div class="sep">================================</div>
  <div class="footer">
    Merci / شكرا لكم<br>
    ${e(timestamp)}
  </div>
</body>
</html>`;

  const printWindow = window.open("", "_blank", "width=350,height=600");
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
  }, 500);
}
