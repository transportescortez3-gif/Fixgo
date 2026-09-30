import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const OUT = path.resolve("attached_assets/Fixgo_Fundamentacion_IVA.pdf");
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const doc = new PDFDocument({
  size: "LETTER",
  margins: { top: 70, bottom: 70, left: 70, right: 70 },
  info: {
    Title: "Fundamentación IVA — Fixgo SpA",
    Author: "Fixgo SpA",
    Subject: "Tratamiento tributario IVA en pagos en efectivo y transferencia directa",
  },
});
doc.pipe(fs.createWriteStream(OUT));

const COLOR = { primary: "#0F172A", muted: "#475569", accent: "#0EA5E9", border: "#E2E8F0", soft: "#F8FAFC" };

const h1 = (t: string) => doc.moveDown(0.3).fillColor(COLOR.primary).font("Helvetica-Bold").fontSize(18).text(t).moveDown(0.4);
const h2 = (t: string) => doc.moveDown(0.6).fillColor(COLOR.primary).font("Helvetica-Bold").fontSize(13).text(t).moveDown(0.25);
const p = (t: string) => doc.fillColor(COLOR.primary).font("Helvetica").fontSize(10.5).text(t, { align: "justify", lineGap: 2 }).moveDown(0.4);
const small = (t: string) => doc.fillColor(COLOR.muted).font("Helvetica-Oblique").fontSize(9).text(t, { align: "justify", lineGap: 1.5 }).moveDown(0.4);
const bullets = (items: string[]) => {
  doc.fillColor(COLOR.primary).font("Helvetica").fontSize(10.5);
  items.forEach((it) => doc.text(`•  ${it}`, { indent: 8, lineGap: 2 }).moveDown(0.15));
  doc.moveDown(0.3);
};

// Header band
doc.rect(0, 0, doc.page.width, 38).fill(COLOR.primary);
doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(11).text("FIXGO SPA · Documento técnico-tributario interno", 70, 14);
doc.moveDown(2);

// Title block
doc.fillColor(COLOR.primary).font("Helvetica-Bold").fontSize(20)
  .text("Fundamentación: Tratamiento de IVA", { align: "left" });
doc.fillColor(COLOR.accent).font("Helvetica-Bold").fontSize(14)
  .text("Pagos vía efectivo y transferencia directa", { align: "left" });
doc.moveDown(0.6);
doc.fillColor(COLOR.muted).font("Helvetica").fontSize(9.5)
  .text("Destinatarios: Dueño de la plataforma · Contador tributario", { align: "left" })
  .text(`Fecha de emisión: abril de 2026`, { align: "left" });
doc.moveDown(0.4);
doc.strokeColor(COLOR.border).lineWidth(0.8).moveTo(70, doc.y).lineTo(doc.page.width - 70, doc.y).stroke();
doc.moveDown(0.6);

p("Objeto: justificar por qué Fixgo SpA factura IVA únicamente sobre su comisión de intermediación, y no sobre el monto total del servicio prestado entre cliente y profesional.");

// Disclaimer box
const dy = doc.y;
doc.rect(70, dy, doc.page.width - 140, 38).fill(COLOR.soft).strokeColor(COLOR.border).lineWidth(0.5).stroke();
doc.fillColor(COLOR.muted).font("Helvetica-Oblique").fontSize(9)
  .text(
    "Importante: este documento contiene la fundamentación técnica del modelo. El contador debe validarlo formalmente y, si lo estima necesario, respaldarlo con una consulta vinculante (oficio) al SII.",
    78, dy + 8, { width: doc.page.width - 156, align: "justify", lineGap: 1.5 }
  );
doc.y = dy + 46;
doc.moveDown(0.5);

// 1
h2("1. Naturaleza jurídica del modelo de negocio");
p("Fixgo no es un prestador del servicio técnico (gasfitería, electricidad, etc.) ni revende servicios a sus clientes. Fixgo opera como plataforma tecnológica de intermediación que conecta a un cliente final (persona natural que requiere un servicio) con un profesional independiente (trabajador) que lo presta directamente.");
p("En términos del Código de Comercio y de la doctrina del SII sobre marketplaces, esto corresponde a la figura de agente o comisionista de mercado (no de mandatario con representación que cobra por cuenta del prestador). El prestador del servicio es el trabajador, no Fixgo.");

// 2
h2("2. Flujo de fondos: la plata nunca pasa por Fixgo");
p("La clave del tratamiento tributario es quién recibe materialmente el pago del servicio. En los métodos de pago habilitados:");

doc.fillColor(COLOR.primary).font("Helvetica-Bold").fontSize(11).text("a) Pago en efectivo").moveDown(0.15);
p("El cliente entrega el dinero directamente en mano al trabajador en el lugar de la prestación. Fixgo no participa de la operación de cobro. La plataforma únicamente registra (con confirmación del trabajador) que el pago ocurrió, para efectos de calcular su comisión.");

doc.fillColor(COLOR.primary).font("Helvetica-Bold").fontSize(11).text("b) Transferencia bancaria directa").moveDown(0.15);
p("El cliente realiza una transferencia electrónica desde su cuenta bancaria personal directamente a la cuenta bancaria del trabajador (cuyos datos —banco, tipo de cuenta, número, RUT— el trabajador previamente registró en la plataforma y el cliente recibe automáticamente al elegir este método).");
p("En ningún momento el dinero ingresa a una cuenta corriente, cuenta vista, ni instrumento financiero de titularidad de Fixgo SpA. Esto está documentado en el sistema mediante:");
bullets([
  "El comprobante de transferencia subido por el cliente (cuando aplica).",
  "La confirmación explícita del trabajador de haber recibido el dinero en su cuenta.",
  "El registro temporal (timestamp) de ambos eventos.",
]);

// 3
h2("3. Hecho gravado y sujeto pasivo del IVA");
p("Conforme al D.L. 825 (Ley de IVA), artículo 8 letra h) y modificaciones posteriores que extendieron el IVA a servicios, el hecho gravado se produce sobre la prestación efectiva del servicio y el sujeto pasivo es quien presta el servicio.");
p("En el modelo Fixgo:");

// Table
type Row = { op: string; prest: string; rec: string; fact: string; base: string };
const rows: Row[] = [
  { op: "Servicio técnico (ej. reparación)", prest: "Trabajador", rec: "Cliente final", fact: "El trabajador (boleta de honorarios o factura electrónica)", base: "Monto total del servicio" },
  { op: "Comisión de intermediación tecnológica", prest: "Fixgo SpA", rec: "Trabajador", fact: "Fixgo SpA (factura electrónica)", base: "Solo el monto de la comisión" },
];
const tableX = 70;
const tableW = doc.page.width - 140;
const cols = [0.22, 0.13, 0.13, 0.32, 0.20];
const colW = cols.map((c) => c * tableW);
const headers = ["Operación", "Prestador", "Receptor", "¿Quién factura?", "Base imponible IVA"];

const drawRow = (cells: string[], opts: { header?: boolean } = {}) => {
  const startY = doc.y;
  doc.font(opts.header ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(opts.header ? "#FFFFFF" : COLOR.primary);
  // Measure max height
  const heights = cells.map((c, i) =>
    doc.heightOfString(c, { width: colW[i] - 10, align: "left" })
  );
  const rowH = Math.max(...heights) + 10;
  // Bg
  if (opts.header) doc.rect(tableX, startY, tableW, rowH).fill(COLOR.primary);
  else doc.rect(tableX, startY, tableW, rowH).fill("#FFFFFF").strokeColor(COLOR.border).lineWidth(0.4).stroke();
  // Text
  let x = tableX;
  doc.fillColor(opts.header ? "#FFFFFF" : COLOR.primary);
  cells.forEach((c, i) => {
    doc.text(c, x + 5, startY + 5, { width: colW[i] - 10, align: "left", lineGap: 1 });
    x += colW[i];
  });
  doc.y = startY + rowH;
};

drawRow(headers, { header: true });
rows.forEach((r) => drawRow([r.op, r.prest, r.rec, r.fact, r.base]));
// Reset cursor para que el texto siguiente vuelva a ocupar el ancho completo
doc.x = doc.page.margins.left;
doc.moveDown(0.5);

p("Fixgo no puede facturar el servicio técnico porque no lo prestó: no es contratista, no posee la patente municipal del rubro, no provee herramientas ni mano de obra, y no asume la responsabilidad civil sobre el resultado del trabajo. Esa responsabilidad recae enteramente en el trabajador independiente.");

// 4
h2("4. Por qué Fixgo solo declara IVA sobre su comisión");
p("De los puntos 2 y 3 se desprende que:");
bullets([
  "Fixgo no recibe el monto total del servicio (no hay devengamiento ni percepción material a su favor por ese monto).",
  "Fixgo no presta el servicio técnico (no es el sujeto pasivo del IVA por esa operación).",
  "Fixgo sí presta un servicio gravado: el servicio de intermediación tecnológica al trabajador, cobrándole una comisión por cada transacción exitosa.",
]);
p("Por lo tanto, la base imponible de IVA de Fixgo SpA corresponde exclusivamente al monto de la comisión cobrada al trabajador, no al monto total transado entre cliente y profesional.");
p("Este criterio es coherente con el tratamiento que el SII ha aplicado históricamente a corredoras, comisionistas, plataformas de avisos clasificados y marketplaces puros (donde el operador no toma propiedad del bien o servicio transado).");

// 5
h2("5. Cobro de la comisión: mecanismo prepagado");
p("Para asegurar el cobro efectivo de la comisión sin que ello implique manejar los fondos del servicio, la plataforma opera bajo un modelo de saldo prepagado del trabajador:");
bullets([
  "Cada trabajador mantiene un saldo mínimo en la plataforma (recargado con anticipación vía Webpay u otro medio donde Fixgo sí emite factura por el monto cargado, dado que ese monto sí corresponde a un servicio futuro de Fixgo).",
  "En cada servicio completado, la comisión se debita automáticamente de ese saldo mediante una operación atómica.",
  "Fixgo emite factura electrónica al trabajador por las comisiones devengadas (consolidación periódica o por operación, según defina el contador).",
]);
p("Este mecanismo deja trazabilidad completa auditable por el SII: cada movimiento de saldo está vinculado a un servicio específico, con monto, fecha, contraparte y estado.");

// 6
h2("6. Evidencia y respaldos operacionales para auditoría");
p("La plataforma genera y conserva, por cada operación, los siguientes respaldos verificables:");
bullets([
  "Identidad de las partes (KYC del trabajador con cédula y verificación de identidad).",
  "Datos bancarios del trabajador registrados con anterioridad y exhibidos al cliente al momento del pago.",
  "Comprobante de transferencia subido por el cliente (en pagos por transferencia directa).",
  "Confirmación explícita del trabajador de haber recibido el pago, con fecha y hora.",
  "Movimiento del saldo del trabajador que registra la comisión cobrada por Fixgo.",
  "Historial completo del servicio: cotización, aceptación, ejecución, cierre y reseñas.",
]);
p("Toda esta información está disponible en el panel de administración de Fixgo y puede exportarse para fiscalización.");

// 7
h2("7. Conclusión");
p("Bajo el modelo descrito, Fixgo SpA actúa como plataforma de intermediación pura, sin tomar propiedad ni custodia de los fondos correspondientes al servicio técnico prestado por el trabajador independiente al cliente final. En consecuencia:");
bullets([
  "Fixgo factura con IVA exclusivamente la comisión cobrada al trabajador (su servicio efectivamente prestado).",
  "El trabajador es responsable de emitir el documento tributario (boleta de honorarios o factura electrónica según su régimen) por el servicio técnico prestado al cliente, sobre el monto total acordado.",
  "El cliente recibe del trabajador el documento tributario correspondiente, no de Fixgo.",
]);
p("Este modelo está alineado con la práctica de marketplaces de servicios reconocida por el SII, y la trazabilidad operacional de la plataforma permite acreditar en cualquier momento que los fondos del servicio nunca ingresaron al patrimonio de Fixgo SpA.");

// Recommendation box
doc.moveDown(0.4);
const ry = doc.y;
const rh = 56;
doc.rect(70, ry, doc.page.width - 140, rh).fill("#FEF3C7").strokeColor("#F59E0B").lineWidth(0.6).stroke();
doc.fillColor("#92400E").font("Helvetica-Bold").fontSize(10.5).text("Recomendación final", 80, ry + 8);
doc.fillColor("#78350F").font("Helvetica").fontSize(9.5).text(
  "Validar formalmente este criterio con el SII mediante una consulta vinculante (oficio) que describa el modelo de Fixgo y solicite confirmación expresa del tratamiento. Esto blinda a la empresa frente a fiscalizaciones futuras.",
  80, ry + 24, { width: doc.page.width - 160, align: "justify", lineGap: 1.5 }
);
doc.y = ry + rh + 14;

// Footer signature block
doc.strokeColor(COLOR.border).lineWidth(0.6).moveTo(70, doc.y).lineTo(doc.page.width - 70, doc.y).stroke();
doc.moveDown(0.4);
doc.fillColor(COLOR.muted).font("Helvetica-Bold").fontSize(10).text("Fixgo SpA");
doc.fillColor(COLOR.muted).font("Helvetica").fontSize(9).text("Documento técnico-tributario interno  ·  Fecha: abril de 2026");

// Page number footer
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  doc.fillColor(COLOR.muted).font("Helvetica").fontSize(8)
    .text(`Página ${i + 1} de ${range.count}`, 70, doc.page.height - 40, { align: "right", width: doc.page.width - 140 });
}

doc.end();
console.log("PDF generado:", OUT);
