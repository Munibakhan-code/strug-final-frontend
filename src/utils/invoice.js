// Branded PDF invoice for an order-history row. jsPDF is loaded on demand
// (dynamic import) so it never weighs down the main bundle. (bug #260)

const CRIMSON = [236, 39, 57]; // #EC2739 — Strug brand mark
const INK = [17, 17, 17];
const MUTED = [120, 120, 120];

// jsPDF has no CSS text-transform, so status/type need manual title-casing —
// mirrors Account.jsx's formatOrderStatus()/orderTypeLabel() for the on-screen table.
const TYPE_LABELS = { test_drive: "Test Drive", mechanic: "Mechanic" };

function titleCase(str) {
  return String(str || "")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatStatus(status) {
  return status ? titleCase(status) : "—";
}

function formatType(type) {
  return TYPE_LABELS[type] || (type ? titleCase(type) : "—");
}

function drawLogo(doc, x, y) {
  // Simple crimson mark (a rotated square) + "STRUG" wordmark, matching the
  // brand accent without needing to rasterise the SVG.
  doc.setFillColor(...CRIMSON);
  doc.triangle(x, y + 6, x + 5, y, x + 10, y + 6, "F");
  doc.triangle(x, y + 6, x + 5, y + 12, x + 10, y + 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text("STRUG", x + 14, y + 10);
}

// order: the normalized order-history row (id, type, title, seller, amount,
// status, date). buyer: { name, email } of the signed-in user.
export async function downloadOrderInvoice(order, buyer = {}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 18; // page margin

  // Header
  drawLogo(doc, M, 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...INK);
  doc.text("INVOICE", pageW - M, 24, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(String(order.id || ""), pageW - M, 30, { align: "right" });

  // Accent rule
  doc.setDrawColor(...CRIMSON);
  doc.setLineWidth(0.8);
  doc.line(M, 38, pageW - M, 38);

  // Meta block
  let y = 50;
  const dateStr = order.date ? new Date(order.date).toLocaleDateString() : "—";
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text("Invoice date", M, y);
  doc.text("Status", M, y + 7);
  doc.setTextColor(...INK);
  doc.text(dateStr, M + 32, y);
  doc.text(formatStatus(order.status), M + 32, y + 7);

  // Bill-to / sold-by
  y += 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("BILLED TO", M, y);
  doc.text("SOLD BY", pageW / 2, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(buyer.name || buyer.email || "Strug customer", M, y + 6);
  if (buyer.email && buyer.name) {
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(buyer.email, M, y + 11);
  }
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(order.seller || "Strug", pageW / 2, y + 6);

  // Line-item table
  y += 24;
  doc.setFillColor(245, 245, 247);
  doc.rect(M, y, pageW - M * 2, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("DESCRIPTION", M + 3, y + 6);
  doc.text("TYPE", pageW / 2 + 10, y + 6);
  doc.text("AMOUNT", pageW - M - 3, y + 6, { align: "right" });

  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  const title = String(order.title || "Order");
  doc.text(title.length > 52 ? title.slice(0, 49) + "…" : title, M + 3, y);
  doc.setTextColor(...MUTED);
  doc.setFontSize(10);
  doc.text(formatType(order.type), pageW / 2 + 10, y);
  doc.setTextColor(...INK);
  doc.setFontSize(11);
  doc.text(String(order.amount || ""), pageW - M - 3, y, { align: "right" });

  // Total
  y += 8;
  doc.setDrawColor(225, 225, 228);
  doc.setLineWidth(0.3);
  doc.line(M, y, pageW - M, y);
  y += 9;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text("Total", pageW / 2 + 10, y);
  doc.text(String(order.amount || ""), pageW - M - 3, y, { align: "right" });

  // Footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Thank you for using Strug.", M, 276);
  doc.text("strug.ca", pageW - M, 276, { align: "right" });

  const safeId = String(order.id || "order").replace(/[^a-zA-Z0-9-]/g, "");
  doc.save(`invoice-${safeId}.pdf`);
}
