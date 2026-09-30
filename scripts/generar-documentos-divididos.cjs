/**
 * Genera la SUITE COMPLETA de documentos legales divididos en
 * A (Fixgo Cliente) y B (Fixgo Driver), USD 1.500 cada uno,
 * conservando las firmas escaneadas del contrato original FX-2026-C001.
 *
 * Salida en attached_assets/:
 *   - Contrato_P2P_Fixgo_Cliente.pdf   (FX-2026-C001A)
 *   - Contrato_P2P_Fixgo_Driver.pdf    (FX-2026-C001B)
 *   - Orden_Trabajo_Fixgo_Cliente.pdf  (FX-2026-OC001A)
 *   - Orden_Trabajo_Fixgo_Driver.pdf   (FX-2026-OC001B)
 *   - Acta_Entrega_Fixgo_Cliente.pdf   (FX-2026-AE001A)
 *   - Acta_Entrega_Fixgo_Driver.pdf    (FX-2026-AE001B)
 *   - Factura_Fixgo_Cliente.pdf        (FX-2026-001A)
 *   - Factura_Fixgo_Driver.pdf         (FX-2026-001B)
 */
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FIRMA_DIR = path.join(ROOT, ".local", "firmas-extraidas");
const FIRMA_MANUEL = path.join(FIRMA_DIR, "alex_firma.png");
const FIRMA_JONATHAN = path.join(FIRMA_DIR, "jonathan_firma_user.png");
const OUTDIR = path.join(ROOT, "attached_assets");

const FECHA = "23 de abril de 2026";
const FECHA_VENCE = "23 de julio de 2026";
const COLOR_AMARILLO = "#EAB308";
const MARCA = "FIXGO";

const PARTES = {
  prestador: {
    nombre: "MANUEL ALEX LEZCANO PÉREZ",
    nombreCap: "Manuel Alex Lezcano Pérez",
    rol: "EL PRESTADOR",
    rolOrden: "PROVEEDOR / PRESTADOR",
    ci: "05060269368",
    tel: "+53 5555 6068",
    dir: "Mario Muñoz 13, Colón, Matanzas, Cuba",
    mail: "manuellezkano@gmail.com",
    desc: "Desarrollador de software freelance",
  },
  adquirente: {
    nombre: "JONATHAN SONNY CORTEZ LAVERIANO",
    nombreCap: "Jonathan Sonny Cortez Laveriano",
    rol: "EL ADQUIRENTE",
    rolOrden: "SOLICITANTE / ADQUIRENTE",
    rut: "23.339.727-K",
    dir: "Santiago Concha 1520, Santiago, RM, Chile",
    mail: "fixxer.sap@gmail.com",
    desc: "Persona natural — Fundador Fixgo SpA (en formación)",
  },
};

const APPS = {
  A: {
    suffix: "A",
    label: "FIXGO (Cliente)",
    labelLong: "FIXGO (Cliente)",
    desc: "App móvil Android + iOS y web responsive: frontend, backend, base de datos, autenticación, geolocalización, pagos y mapas en tiempo real. Cesión total de IP del módulo Cliente.",
    descCorta: "App móvil Android + iOS + Web responsive. Frontend, backend, base de datos, autenticación, geolocalización, pagos y mapas en tiempo real. Cesión total de IP.",
    archivoBase: "Fixgo_Cliente",
    docContrato: "FX-2026-C001A",
    docOrden: "FX-2026-OC001A",
    docActa: "FX-2026-AE001A",
    docFactura: "FX-2026-001A",
  },
  B: {
    suffix: "B",
    label: "FIXGO DRIVER (Trabajador)",
    labelLong: "FIXGO DRIVER (Trabajador)",
    desc: "App móvil Android + iOS para trabajadores: GPS en tiempo real, gestión de servicios, cobros, saldo y reportes. Cesión total de IP del módulo Driver.",
    descCorta: "App móvil Android + iOS para trabajadores. GPS en tiempo real, gestión de servicios, cobros, saldo, reportes. Cesión total de IP.",
    archivoBase: "Fixgo_Driver",
    docContrato: "FX-2026-C001B",
    docOrden: "FX-2026-OC001B",
    docActa: "FX-2026-AE001B",
    docFactura: "FX-2026-001B",
  },
};

const PRECIO_USD = 1500;
const PRECIO_FMT = "USD 1.500";
const PRECIO_LETRAS = "mil quinientos dólares estadounidenses";
const PAGADO_TOTAL_USD = PRECIO_USD;
const SALDO = 0;

// ============ HELPERS ============
function nuevoDoc({ titulo, asunto, compact = false }) {
  return new PDFDocument({
    size: "A4",
    margins: { top: compact ? 28 : 36, bottom: 28, left: 42, right: 42 },
    info: {
      Title: titulo,
      Author: "Fixgo SpA (en formación)",
      Subject: asunto,
    },
  });
}

function header(doc, tipoDoc, docN) {
  doc.font("Helvetica-Bold").fontSize(18).fillColor(COLOR_AMARILLO).text(MARCA, { align: "left" });
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000").text(tipoDoc);
  doc.font("Helvetica").fontSize(8).fillColor("#444").text(
    `Doc N°: ${docN}  |  Fecha de emisión: ${FECHA}  |  Santiago, Chile / Colón, Cuba`,
  );
  doc.moveTo(42, doc.y + 4).lineTo(553, doc.y + 4).strokeColor(COLOR_AMARILLO).lineWidth(1).stroke();
  doc.moveDown(0.6);
}

function firmasEmbebidas(doc, etiquetaIzq = "PRESTADOR / EMISOR", etiquetaDer = "ADQUIRENTE / RECEPTOR") {
  doc.moveDown(0.4);
  const yFirmas = doc.y;
  const colWidth = 245;
  const colLeft = 42;
  const colRight = 42 + colWidth + 21;

  doc.font("Helvetica-Bold").fontSize(7).fillColor("#666");
  doc.text(etiquetaIzq, colLeft, yFirmas, { width: colWidth });
  doc.text(etiquetaDer, colRight, yFirmas, { width: colWidth });
  const yImg = yFirmas + 10;

  doc.image(FIRMA_MANUEL, colLeft, yImg, { fit: [colWidth, 50] });
  doc.image(FIRMA_JONATHAN, colRight, yImg, { fit: [colWidth, 50] });

  const yLinea = yImg + 52;
  doc.moveTo(colLeft, yLinea).lineTo(colLeft + colWidth, yLinea).strokeColor("#000").lineWidth(0.5).stroke();
  doc.moveTo(colRight, yLinea).lineTo(colRight + colWidth, yLinea).stroke();

  doc.font("Helvetica-Bold").fontSize(8).fillColor("#000");
  doc.text(PARTES.prestador.nombreCap, colLeft, yLinea + 3, { width: colWidth });
  doc.text(PARTES.adquirente.nombreCap, colRight, yLinea + 3, { width: colWidth });

  doc.font("Helvetica").fontSize(7.5).fillColor("#333");
  const yDatos = yLinea + 14;
  doc.text(`CI: ${PARTES.prestador.ci}  |  ${PARTES.prestador.tel}`, colLeft, yDatos, { width: colWidth });
  doc.text(`RUT: ${PARTES.adquirente.rut}`, colRight, yDatos, { width: colWidth });
  doc.text(PARTES.prestador.dir, colLeft, yDatos + 9, { width: colWidth });
  doc.text(PARTES.adquirente.dir, colRight, yDatos + 9, { width: colWidth });
  doc.text(PARTES.prestador.mail, colLeft, yDatos + 18, { width: colWidth });
  doc.text(PARTES.adquirente.mail, colRight, yDatos + 18, { width: colWidth });

  const yFooter = yDatos + 36;
  doc.font("Helvetica-Oblique").fontSize(6.5).fillColor("#666").text(
    "Documento privado entre personas naturales. Firma electrónica simple — Ley 19.799 de Chile y práctica internacional. Hash y trazabilidad en expediente del emisor.",
    42, yFooter, { width: 511, align: "center" },
  );
}

function par(doc, texto, opts = {}) {
  doc.font("Helvetica").fontSize(8.4).fillColor("#000").text(texto, { align: "justify", lineGap: 1.2, ...opts });
  doc.moveDown(0.25);
}
function clausula(doc, titulo) {
  doc.font("Helvetica-Bold").fontSize(8.4).fillColor("#000").text(titulo);
}
function pipe(doc, archivo) {
  const out = path.join(OUTDIR, archivo);
  doc.pipe(fs.createWriteStream(out));
  return out;
}
function finalizar(doc) {
  doc.end();
  return new Promise((resolve) => doc.on("end", resolve));
}

// ============ 1. CONTRATO P2P ============
async function generarContrato(app) {
  const archivo = `Contrato_P2P_${app.archivoBase}.pdf`;
  const doc = nuevoDoc({ titulo: `Contrato P2P ${app.label}`, asunto: "Contrato P2P de desarrollo de software" });
  const out = pipe(doc, archivo);

  header(doc, `CONTRATO PRIVADO P2P — ${app.label}`, app.docContrato);

  par(doc, `De una parte, ${PARTES.prestador.nombre}, persona natural, ${PARTES.prestador.desc.toLowerCase()}, CI cubano N° ${PARTES.prestador.ci}, domicilio ${PARTES.prestador.dir} ("${PARTES.prestador.rol}"). De otra parte, ${PARTES.adquirente.nombre}, persona natural, RUT ${PARTES.adquirente.rut}, domicilio ${PARTES.adquirente.dir} ("${PARTES.adquirente.rol}"). Ambos, actuando a título estrictamente personal y con plena capacidad legal, otorgan el presente contrato según las cláusulas siguientes.`);

  clausula(doc, "PRIMERA — ANTECEDENTES Y OBJETO");
  par(doc, `EL ADQUIRENTE proyecta constituir en Chile la sociedad "Fixgo SpA" (en formación), cuyo giro será operar una plataforma digital de intermediación de servicios para el hogar. Encarga al PRESTADOR el desarrollo del software base para aportarlo como activo intangible. El PRESTADOR se obliga a desarrollar, entregar y ceder al ADQUIRENTE: ${app.label} — ${app.desc}`);

  clausula(doc, "SEGUNDA — PRECIO Y FORMA DE PAGO");
  par(doc, `El ADQUIRENTE pagará al PRESTADOR la suma de ${PRECIO_FMT} (${PRECIO_LETRAS}) por el desarrollo y cesión de los entregables descritos. El pago se efectuará mediante transferencia de criptomoneda USDT en red BEP20 (Binance Smart Chain), a la cuenta CoinEx del PRESTADOR (e38377066@gmail.com), de forma parcializada según hitos funcionales acordados, dentro del plazo máximo de TRES (3) MESES contado desde la emisión, venciendo el ${FECHA_VENCE}. Cada transferencia se acreditará por hash on-chain como comprobante suficiente del pago parcial. Las partes reconocen que el ANTICIPO ya pagado dentro del proyecto global FX-2026 (USD 500) se imputa a la presente operación.`);

  clausula(doc, "TERCERA — CESIÓN DE PROPIEDAD INTELECTUAL CONDICIONADA AL PAGO TOTAL");
  par(doc, `El PRESTADOR cede al ADQUIRENTE, en forma TOTAL, EXCLUSIVA, PERPETUA, IRREVOCABLE y MUNDIAL, todos los derechos patrimoniales sobre los entregables (código fuente y objeto, documentación, diseños, interfaces, bases de datos, marcas, nombres asociados y desarrollos derivados), incluyendo reproducción, distribución, modificación, comunicación pública, transformación, sublicencia y comercialización por cualquier medio. Mientras el saldo no esté pagado, el ADQUIRENTE recibe una LICENCIA de uso, inspección y deployment no exclusiva, perfeccionándose la cesión plena de pleno derecho una vez verificado el pago total. EL ADQUIRENTE queda facultado para aportar estos derechos a "Fixgo SpA" una vez constituida.`);

  clausula(doc, "CUARTA — INDEPENDENCIA P2P Y TRATAMIENTO TRIBUTARIO");
  par(doc, `Contrato P2P entre dos personas naturales independientes; NO existe relación laboral, subordinación, exclusividad ni vínculo societario. El PRESTADOR actúa como contratista independiente y asume sus obligaciones tributarias bajo la legislación cubana. Las partes reconocen que: (i) los servicios se prestan ÍNTEGRAMENTE desde Cuba, sin presencia física en Chile; (ii) la operación es una venta única, no habitual, de software a medida con cesión total de IP, NO un servicio digital recurrente del Art. 8 letra n) DL 825; (iii) por su naturaleza P2P entre no contribuyentes de IVA y por el ámbito territorial del DL 825, NO se encuentra afecta a IVA chileno; (iv) el PRESTADOR carece de RUT chileno y no tiene obligación de inicio de actividades en Chile.`);

  clausula(doc, "QUINTA — CONFIDENCIALIDAD, GARANTÍAS Y RESPONSABILIDAD");
  par(doc, `Las partes mantendrán confidencialidad sobre la información técnica y comercial intercambiada por cinco (5) años. El PRESTADOR garantiza que los entregables son originales y no infringen derechos de terceros; otorga garantía técnica por defectos de 30 días desde la entrega final aceptada. La responsabilidad máxima del PRESTADOR queda limitada al monto efectivamente pagado por el ADQUIRENTE bajo este contrato.`);

  clausula(doc, "SEXTA — LEY APLICABLE, JURISDICCIÓN Y FIRMA");
  par(doc, `El contrato se rige por la legislación chilena respecto del ADQUIRENTE y cubana respecto del PRESTADOR. Las controversias se resolverán por mediación directa; en su defecto, por arbitraje conforme a reglas de la CCI o, alternativamente, ante los tribunales ordinarios de Santiago, Chile, a elección del demandante. Entra en vigor desde su firma, perfeccionada por firma electrónica simple conforme a Ley 19.799 de Chile y práctica internacional.`);

  firmasEmbebidas(doc, "PRESTADOR", "ADQUIRENTE");
  await finalizar(doc);
  return out;
}

// ============ 2. ORDEN DE TRABAJO ============
async function generarOrdenTrabajo(app) {
  const archivo = `Orden_Trabajo_${app.archivoBase}.pdf`;
  const doc = nuevoDoc({ titulo: `Orden de Trabajo ${app.label}`, asunto: "Orden de trabajo y compra", compact: true });
  const out = pipe(doc, archivo);

  header(doc, `ORDEN DE TRABAJO Y COMPRA — ${app.label}`, app.docOrden);

  // Bloque comparecientes (2 columnas, compacto)
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#000");
  const yPart = doc.y;
  doc.text("SOLICITANTE / ADQUIRENTE", 42, yPart);
  doc.text("PROVEEDOR / PRESTADOR", 308, yPart);
  doc.font("Helvetica").fontSize(7.5).fillColor("#000");
  doc.text(`${PARTES.adquirente.nombreCap}  |  RUT: ${PARTES.adquirente.rut}`, 42, yPart + 10);
  doc.text(PARTES.adquirente.dir, 42, yPart + 19);
  doc.text(`${PARTES.adquirente.mail}  |  ${PARTES.adquirente.desc}`, 42, yPart + 28);

  doc.text(`${PARTES.prestador.nombreCap}  |  CI: ${PARTES.prestador.ci}`, 308, yPart + 10);
  doc.text(PARTES.prestador.dir, 308, yPart + 19);
  doc.text(`${PARTES.prestador.mail}  |  ${PARTES.prestador.desc}`, 308, yPart + 28);

  doc.x = 42; doc.y = yPart + 42;

  clausula(doc, "OBJETO DE LA ORDEN");
  par(doc, `Por la presente, el SOLICITANTE encarga formalmente al PROVEEDOR la ejecución del desarrollo de software detallado a continuación, conforme a las especificaciones técnicas y comerciales acordadas en el Contrato P2P ${app.docContrato} de fecha ${FECHA}.`);

  clausula(doc, "DETALLE DE LOS TRABAJOS ENCARGADOS");
  doc.moveDown(0.2);
  // Tabla simple
  const yTab = doc.y;
  doc.rect(42, yTab, 511, 18).fillAndStroke("#FEF3C7", "#EAB308");
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#000");
  doc.text("DESCRIPCIÓN DEL TRABAJO", 47, yTab + 5);
  doc.text("CANT.", 360, yTab + 5);
  doc.text("PRECIO USD", 410, yTab + 5);
  doc.text("TOTAL USD", 490, yTab + 5);
  const yRow = yTab + 18;
  doc.rect(42, yRow, 511, 38).strokeColor("#ccc").stroke();
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#000").text(`Aplicación ${app.label}`, 47, yRow + 4);
  doc.font("Helvetica").fontSize(7.8).fillColor("#333").text(app.descCorta, 47, yRow + 14, { width: 305 });
  doc.font("Helvetica").fontSize(8).fillColor("#000");
  doc.text("1", 365, yRow + 14);
  doc.text(`$${PRECIO_USD.toLocaleString("en-US")}.00`, 410, yRow + 14);
  doc.text(`$${PRECIO_USD.toLocaleString("en-US")}.00`, 490, yRow + 14);
  // Total
  const yTotal = yRow + 38;
  doc.rect(42, yTotal, 511, 16).fillAndStroke("#1f2937", "#1f2937");
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#fff").text("TOTAL ENCARGO:", 290, yTotal + 4);
  doc.text(`$${PRECIO_USD.toLocaleString("en-US")}.00 USD`, 470, yTotal + 4);
  doc.fillColor("#000");
  doc.x = 42; doc.y = yTotal + 22;

  clausula(doc, "PLAZOS Y CONDICIONES DE ENTREGA");
  par(doc, `Plazo de ejecución: trabajo a entregar a satisfacción del SOLICITANTE dentro del encargo Fixgo, con plazo máximo TRES (3) MESES desde la emisión (vencimiento ${FECHA_VENCE}). Forma de entrega: código fuente íntegro mediante repositorio Git privado, builds compilados (APK Android e IPA iOS), credenciales de servicios asociados, documentación técnica y manual de despliegue. Forma de pago: importe total de ${PRECIO_FMT}, pagado íntegramente mediante USDT BEP20 vía CoinEx (e38377066@gmail.com).`);

  clausula(doc, "AUTORIZACIÓN");
  par(doc, `Mediante la firma de la presente orden, el SOLICITANTE autoriza expresamente al PROVEEDOR a iniciar/ejecutar los trabajos y declara que el importe total de los entregables ha sido pagado íntegramente conforme a lo aquí establecido y al Contrato ${app.docContrato}.`);

  firmasEmbebidas(doc, "PROVEEDOR / PRESTADOR", "SOLICITANTE / ADQUIRENTE");
  await finalizar(doc);
  return out;
}

// ============ 3. ACTA DE ENTREGA ============
async function generarActa(app) {
  const archivo = `Acta_Entrega_${app.archivoBase}.pdf`;
  const doc = nuevoDoc({ titulo: `Acta de Entrega ${app.label}`, asunto: "Acta de entrega y aceptación" });
  const out = pipe(doc, archivo);

  header(doc, `ACTA DE ENTREGA Y ACEPTACIÓN — ${app.label}`, app.docActa);

  clausula(doc, "COMPARECIENTES");
  par(doc, `De una parte, ${PARTES.prestador.nombre}, CI N° ${PARTES.prestador.ci}, domiciliado en ${PARTES.prestador.dir}, en calidad de PRESTADOR. De la otra parte, ${PARTES.adquirente.nombre}, RUT ${PARTES.adquirente.rut}, domiciliado en ${PARTES.adquirente.dir}, en calidad de ADQUIRENTE.`);

  clausula(doc, "ANTECEDENTES");
  par(doc, `Que con fecha ${FECHA}, las partes suscribieron el Contrato P2P ${app.docContrato} y la Orden de Trabajo ${app.docOrden}, en virtud de los cuales el PRESTADOR se obligó a desarrollar y entregar al ADQUIRENTE el software ${app.label}, con cesión total de propiedad intelectual.`);

  clausula(doc, `ENTREGABLES RECIBIDOS POR EL ADQUIRENTE — ${app.label}`);
  doc.moveDown(0.15);
  const items = app.suffix === "A"
    ? [
        "Código fuente completo de la aplicación FIXGO (Cliente): repositorio Git con frontend React + Vite + TypeScript, backend Express + Drizzle, base de datos PostgreSQL.",
        "Integración Capacitor para Android e iOS del módulo Cliente.",
        "Build web responsive desplegable (Vite production build).",
        "Esquema de base de datos PostgreSQL (Drizzle migrations).",
        "Credenciales y archivos de configuración de servicios externos asociados (Google Maps, Firebase, etc.).",
        "Documentación técnica: arquitectura, despliegue y guía de mantenimiento del módulo Cliente.",
        "Cesión escrita de propiedad intelectual sobre los entregables del módulo Cliente.",
      ]
    : [
        "Código fuente completo de la aplicación FIXGO DRIVER (Trabajador): app móvil con geolocalización GPS en tiempo real.",
        "Módulos de gestión de servicios, cobros, saldo prepagado y reportes.",
        "Builds compilados: APK Android y proyecto iOS listo para firma y publicación en App Store.",
        "Integración con backend compartido (consume APIs del módulo Cliente).",
        "Documentación técnica del módulo Driver: arquitectura, despliegue y guía de mantenimiento.",
        "Cesión escrita de propiedad intelectual sobre los entregables del módulo Driver.",
      ];
  doc.font("Helvetica").fontSize(8.2).fillColor("#000");
  for (const it of items) {
    doc.text(`•  ${it}`, { indent: 6, lineGap: 1.2 });
  }
  doc.moveDown(0.3);

  clausula(doc, "DECLARACIÓN DE ACEPTACIÓN");
  par(doc, `EL ADQUIRENTE declara haber recibido a entera satisfacción la totalidad de los entregables individualizados precedentemente, los cuales han sido revisados, probados y se encuentran conformes con las especificaciones acordadas en el Contrato y la Orden de Trabajo. Se declaran cumplidas íntegramente las obligaciones del PRESTADOR derivadas de dichos instrumentos respecto del módulo ${app.label}.`);

  clausula(doc, "CONFIRMACIÓN DE CESIÓN DE PROPIEDAD INTELECTUAL");
  par(doc, `Mediante la presente acta se confirma y perfecciona la cesión total, exclusiva, perpetua, irrevocable y mundial de todos los derechos patrimoniales de propiedad intelectual sobre los entregables del módulo ${app.label} a favor del ADQUIRENTE, quien queda facultado para aportarlos como activo intangible a la sociedad "Fixgo SpA" una vez constituida en Chile.`);

  clausula(doc, "PAGO Y CIERRE");
  par(doc, `El ADQUIRENTE se obliga a transferir el monto pactado de ${PRECIO_FMT} mediante USDT BEP20 a la cuenta CoinEx del PRESTADOR (e38377066@gmail.com) según el cronograma parcializado del Contrato ${app.docContrato}. El hash de transacción correspondiente formará parte integrante del expediente. Con la suscripción de la presente Acta, las partes dan por terminada la relación contractual derivada del Contrato ${app.docContrato} y la Orden ${app.docOrden}, sin tener nada que reclamarse mutuamente, salvo el cumplimiento del pago pactado y la garantía técnica de 30 días sobre defectos.`);

  firmasEmbebidas(doc, "PRESTADOR (entrega)", "ADQUIRENTE (recibe conforme)");
  await finalizar(doc);
  return out;
}

// ============ 4. FACTURA COMERCIAL ============
async function generarFactura(app) {
  const archivo = `Factura_${app.archivoBase}.pdf`;
  const doc = nuevoDoc({ titulo: `Factura ${app.label}`, asunto: "Factura comercial", compact: true });
  const out = pipe(doc, archivo);

  header(doc, `FACTURA COMERCIAL — ${app.label}`, app.docFactura);

  // Emisor / Cliente en 2 cols compactas
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#000");
  const yPart = doc.y;
  doc.text("EMISOR / ISSUER", 42, yPart);
  doc.text("CLIENTE / BILL TO", 308, yPart);
  doc.font("Helvetica").fontSize(7.5).fillColor("#000");
  doc.text(`${PARTES.prestador.nombreCap}  |  CI: ${PARTES.prestador.ci}`, 42, yPart + 10);
  doc.text(PARTES.prestador.dir, 42, yPart + 19);
  doc.text(`${PARTES.prestador.mail}  |  ${PARTES.prestador.tel}`, 42, yPart + 28);

  doc.text(`${PARTES.adquirente.nombreCap}  |  RUT: ${PARTES.adquirente.rut}`, 308, yPart + 10);
  doc.text(PARTES.adquirente.dir, 308, yPart + 19);
  doc.text(`${PARTES.adquirente.mail}  |  ${PARTES.adquirente.desc}`, 308, yPart + 28);

  doc.x = 42; doc.y = yPart + 42;

  clausula(doc, "CONCEPTO / CONCEPT");
  par(doc, `Servicios profesionales independientes de desarrollo de software ejecutados ÍNTEGRAMENTE desde Cuba por persona natural freelance, en virtud de acuerdo privado P2P (peer-to-peer) celebrado entre dos personas naturales independientes. El cliente recibe los entregables a título personal con el propósito de aportarlos posteriormente como activo intangible a la sociedad "Fixgo SpA" (en proceso de constitución en Chile).`);

  // Tabla
  doc.moveDown(0.2);
  const yTab = doc.y;
  doc.rect(42, yTab, 511, 18).fillAndStroke("#FEF3C7", "#EAB308");
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#000");
  doc.text("DESCRIPCIÓN / DESCRIPTION", 47, yTab + 5);
  doc.text("CANT.", 360, yTab + 5);
  doc.text("PRECIO USD", 410, yTab + 5);
  doc.text("TOTAL", 500, yTab + 5);
  const yRow = yTab + 18;
  doc.rect(42, yRow, 511, 38).strokeColor("#ccc").stroke();
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#000").text(`Aplicación ${app.label}`, 47, yRow + 4);
  doc.font("Helvetica").fontSize(7.8).fillColor("#333").text(app.descCorta, 47, yRow + 14, { width: 305 });
  doc.font("Helvetica").fontSize(8).fillColor("#000");
  doc.text("1", 365, yRow + 14);
  doc.text(`$${PRECIO_USD.toLocaleString("en-US")}.00`, 410, yRow + 14);
  doc.text(`$${PRECIO_USD.toLocaleString("en-US")}.00`, 490, yRow + 14);

  // Subtotal / Total
  const yTotals = yRow + 44;
  doc.font("Helvetica").fontSize(8).fillColor("#000");
  doc.text("Subtotal:", 360, yTotals);
  doc.text(`$${PRECIO_USD.toLocaleString("en-US")}.00 USD`, 470, yTotals);
  doc.text("Impuestos (IVA):", 360, yTotals + 11);
  doc.text("No aplica", 470, yTotals + 11);
  doc.font("Helvetica-Bold").text("TOTAL FACTURA:", 360, yTotals + 22);
  doc.text(`$${PRECIO_USD.toLocaleString("en-US")}.00 USD`, 470, yTotals + 22);
  doc.font("Helvetica").text("Pagado 100%:", 360, yTotals + 33);
  doc.text(`$${PAGADO_TOTAL_USD.toLocaleString("en-US")}.00 USD`, 470, yTotals + 33);
  doc.text("Saldo pendiente:", 360, yTotals + 44);
  doc.text(`$${SALDO.toLocaleString("en-US")}.00 USD`, 470, yTotals + 44);

  doc.x = 42; doc.y = yTotals + 60;

  clausula(doc, "CONDICIONES DE PAGO");
  par(doc, `Esta factura corresponde exclusivamente a ${app.label} por un importe total de ${PRECIO_FMT}. El importe total ha sido pagado íntegramente, por lo que el saldo pendiente es de USD 0.00.`);

  clausula(doc, "DATOS DE PAGO");
  par(doc, `Beneficiario: ${PARTES.prestador.nombreCap} | Método: Criptomoneda USDT (Tether) | Red: BEP20 (Binance Smart Chain) | Exchange: CoinEx | Email asociado: e38377066@gmail.com`);

  clausula(doc, "DECLARACIÓN LEGAL");
  par(doc, `NATURALEZA: VENTA ÚNICA Y NO HABITUAL de software a medida con CESIÓN DE PROPIEDAD INTELECTUAL del emisor (persona natural residente en Cuba) al adquirente (persona natural residente en Chile), bajo contrato privado P2P. La operación NO se encuentra afecta a IVA chileno (DL 825) por: (i) servicios prestados ÍNTEGRAMENTE en el extranjero (Cuba); (ii) NO constituye "servicio digital" del Art. 8 letra n) DL 825; (iii) transferencia de bien intangible entre personas naturales no contribuyentes de IVA; (iv) emisor sin RUT chileno. IMPUESTO ADICIONAL Art. 59 DL 824: no aplica retención (adquirente persona natural, no agente retenedor empresarial). El emisor declara que tributará este ingreso conforme a la legislación cubana aplicable.`);

  firmasEmbebidas(doc, "EMISOR / ISSUER", "CLIENTE / BILL TO");
  await finalizar(doc);
  return out;
}

// ============ MAIN ============
(async () => {
  const generadores = [generarContrato, generarOrdenTrabajo, generarActa, generarFactura];
  for (const app of [APPS.A, APPS.B]) {
    for (const gen of generadores) {
      const out = await gen(app);
      console.log("OK:", path.basename(out), `(${fs.statSync(out).size} bytes)`);
    }
  }
})();
