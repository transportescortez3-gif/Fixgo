import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "node:fs/promises";
import path from "node:path";

const OUT = "attached_assets/firmados";
await fs.mkdir(OUT, { recursive: true });

const PAGE = { w: 595.28, h: 841.89 };
const M = { l: 50, r: 50, t: 50, b: 50 };
const COL = { primary: rgb(0.93, 0.7, 0.03), text: rgb(0.07, 0.07, 0.07), muted: rgb(0.4, 0.4, 0.4), line: rgb(0.85, 0.85, 0.85) };

function wrap(text, font, size, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) cur = trial;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

async function newDoc(title) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const helvO = await pdf.embedFont(StandardFonts.HelveticaOblique);
  // Use a built-in italic font when the optional handwritten font is absent.
  const caveat = helvO;
  pdf.setTitle(title);
  return { pdf, helv, helvB, helvO, caveat };
}

class Cursor {
  constructor(page, fonts) { this.page = page; this.fonts = fonts; this.x = M.l; this.y = PAGE.h - M.t; }
  newPage(pdf) { this.page = pdf.addPage([PAGE.w, PAGE.h]); this.x = M.l; this.y = PAGE.h - M.t; return this.page; }
  ensure(needed, pdf) { if (this.y - needed < M.b) this.newPage(pdf); }
  txt(s, opts = {}) {
    const font = opts.bold ? this.fonts.helvB : opts.italic ? this.fonts.helvO : this.fonts.helv;
    const size = opts.size ?? 9.5;
    const color = opts.color ?? COL.text;
    const x = opts.x ?? this.x;
    this.page.drawText(s, { x, y: this.y, size, font, color });
  }
  para(text, opts = {}) {
    const font = opts.bold ? this.fonts.helvB : opts.italic ? this.fonts.helvO : this.fonts.helv;
    const size = opts.size ?? 9.5;
    const lh = opts.lh ?? size + 3;
    const maxW = PAGE.w - M.l - M.r;
    const lines = wrap(text, font, size, maxW);
    for (const line of lines) {
      this.ensure(lh, opts.pdf);
      this.page.drawText(line, { x: M.l, y: this.y, size, font, color: opts.color ?? COL.text });
      this.y -= lh;
    }
  }
  gap(h = 8) { this.y -= h; }
  line(opts = {}) {
    this.ensure(6, opts.pdf);
    this.page.drawLine({ start: { x: M.l, y: this.y }, end: { x: PAGE.w - M.r, y: this.y }, thickness: 0.5, color: opts.color ?? COL.line });
    this.y -= 6;
  }
}

function header(c, docTitle, docNum, fecha) {
  c.page.drawRectangle({ x: 0, y: PAGE.h - 80, width: PAGE.w, height: 80, color: rgb(0.06, 0.06, 0.06) });
  c.page.drawText("FIXGO", { x: M.l, y: PAGE.h - 38, size: 22, font: c.fonts.helvB, color: COL.primary });
  c.page.drawText(docTitle, { x: M.l, y: PAGE.h - 60, size: 11, font: c.fonts.helvB, color: rgb(1, 1, 1) });
  const sub = `Doc N°: ${docNum}  |  Fecha de emisión: ${fecha}`;
  c.page.drawText(sub, { x: M.l, y: PAGE.h - 73, size: 8, font: c.fonts.helv, color: rgb(0.85, 0.85, 0.85) });
  c.y = PAGE.h - 100;
}

async function signatureBlock(c, pdf, leftName, leftMeta, rightName, rightMeta, jonathanSigPath) {
  c.ensure(110, pdf);
  c.gap(12);
  const yTop = c.y;
  const colW = (PAGE.w - M.l - M.r - 30) / 2;
  const lx = M.l;
  const rx = M.l + colW + 30;

  // Left (PRESTADOR — Manuel Alex Lezcano) — firma como recorte (igual estilo que la de Jonathan)
  let ly;
  try {
    const alexBytes = await fs.readFile(`${SIG_DIR}/alex_firma.png`);
    const alexImg = await pdf.embedPng(alexBytes);
    const ratio = alexImg.height / alexImg.width;
    const drawW = Math.min(colW, 230);
    const drawH = drawW * ratio;
    c.page.drawImage(alexImg, { x: lx, y: yTop - 4 - drawH, width: drawW, height: drawH });
    ly = yTop - 8 - drawH;
  } catch (err) {
    console.warn("No se pudo embebir firma Alex:", err?.message);
    c.page.drawText("Alex", { x: lx + 10, y: yTop - 18, size: 34, font: c.fonts.caveat, color: rgb(0.05, 0.1, 0.45) });
    c.page.drawLine({ start: { x: lx, y: yTop - 38 }, end: { x: lx + colW, y: yTop - 38 }, thickness: 0.7, color: COL.text });
    c.page.drawText(leftName, { x: lx, y: yTop - 50, size: 9, font: c.fonts.helvB, color: COL.text });
    ly = yTop - 62;
  }
  for (const line of leftMeta) { c.page.drawText(line, { x: lx, y: ly, size: 7.5, font: c.fonts.helv, color: COL.muted }); ly -= 10; }

  // Right (ADQUIRENTE — Jonathan) — pegado tal cual el recorte enviado por el ADQUIRENTE
  let ry;
  if (jonathanSigPath) {
    try {
      const sigBytes = await fs.readFile(jonathanSigPath);
      const sigImg = await pdf.embedPng(sigBytes);
      const ratio = sigImg.height / sigImg.width;
      const drawW = Math.min(colW, 230);
      const drawH = drawW * ratio;
      // se sobrepone tapando línea y nombre (la imagen YA incluye firma + nombre + línea)
      c.page.drawImage(sigImg, { x: rx, y: yTop - 4 - drawH, width: drawW, height: drawH });
      ry = yTop - 8 - drawH; // meta info debajo del recorte
    } catch (err) {
      console.warn("No se pudo embebir firma Jonathan:", err?.message);
      c.page.drawText("Jonathan", { x: rx + 10, y: yTop - 18, size: 24, font: c.fonts.caveat, color: rgb(0.05, 0.1, 0.45) });
      c.page.drawLine({ start: { x: rx, y: yTop - 38 }, end: { x: rx + colW, y: yTop - 38 }, thickness: 0.7, color: COL.text });
      c.page.drawText(rightName, { x: rx, y: yTop - 50, size: 9, font: c.fonts.helvB, color: COL.text });
      ry = yTop - 62;
    }
  } else {
    c.page.drawLine({ start: { x: rx, y: yTop - 38 }, end: { x: rx + colW, y: yTop - 38 }, thickness: 0.7, color: COL.text });
    c.page.drawText(rightName, { x: rx, y: yTop - 50, size: 9, font: c.fonts.helvB, color: COL.text });
    ry = yTop - 62;
  }
  for (const line of rightMeta) { c.page.drawText(line, { x: rx, y: ry, size: 7.5, font: c.fonts.helv, color: COL.muted }); ry -= 10; }

  c.y = yTop - 100;

  // Pequeña marca electrónica (Ley 19.799)
  const marca = "Firma electrónica simple — Ley 19.799 (Chile). Hash y trazabilidad en expediente del emisor.";
  c.page.drawText(marca, { x: M.l, y: M.b + 8, size: 6.5, font: c.fonts.helvO, color: COL.muted });
}

const PRESTADOR = {
  name: "Manuel Alex Lezcano Pérez",
  meta: [
    "CI: 05060269368  |  +53 5555 6068",
    "Mario Muñoz 13, Colón, Matanzas, Cuba",
    "manuellezkano@gmail.com",
  ],
};
const ADQUIRENTE = {
  name: "Jonathan Sonny Cortez Laveriano",
  meta: [
    "RUT: 23.339.727-K",
    "Santiago Concha 1520, Santiago, RM, Chile",
    "fixxer.sap@gmail.com",
  ],
};

const FECHA_EMISION = "23 de abril de 2026";
const FECHA_PLAZO = "23 de julio de 2026";
const PAGADO_INICIAL_USD = 500;
const TOTAL_USD = 1500;
const SALDO_USD = TOTAL_USD - PAGADO_INICIAL_USD;

/* =========================================================== */
/*  1) CONTRATO P2P                                            */
/* =========================================================== */
const SIG_DIR = ".local/firmas-extraidas";
const SIG_JONATHAN = `${SIG_DIR}/jonathan_firma_user.png`;
const SIG_ALEX = `${SIG_DIR}/alex_firma.png`;
const SIG_CONTRATO = SIG_JONATHAN;
const SIG_ORDEN    = SIG_JONATHAN;
const SIG_ACTA     = SIG_JONATHAN;
const SIG_FACTURA  = SIG_JONATHAN;

async function buildContrato() {
  const { pdf, ...fonts } = await newDoc("Contrato P2P FX-2026-C001");
  const page = pdf.addPage([PAGE.w, PAGE.h]);
  const c = new Cursor(page, fonts);
  header(c, "CONTRATO PRIVADO P2P  —  DESARROLLO DE SOFTWARE Y CESIÓN DE PROPIEDAD INTELECTUAL", "FX-2026-C001", FECHA_EMISION);

  const P = { size: 7.8, lh: 10, pdf };
  const T = (s) => { c.txt(s, { bold: true, size: 8.5 }); c.y -= 11; };

  c.para("Santiago, Chile / Colón, Cuba.", { italic: true, size: 8, color: COL.muted, pdf });
  c.gap(4);

  T("COMPARECIENTES");
  c.para(
    "De una parte, MANUEL ALEX LEZCANO PÉREZ, persona natural, desarrollador de software freelance, CI cubano N° 05060269368, " +
    "domicilio Mario Muñoz 13, Colón, Matanzas, Cuba (\"EL PRESTADOR\"). De otra parte, JONATHAN SONNY CORTEZ LAVERIANO, " +
    "persona natural, RUT 23.339.727-K, domicilio Santiago Concha 1520, Santiago, RM, Chile (\"EL ADQUIRENTE\"). Ambos, actuando " +
    "a título estrictamente personal y con plena capacidad legal, otorgan el presente contrato según las cláusulas siguientes.",
    P
  );
  c.gap(3);

  T("PRIMERA — ANTECEDENTES Y OBJETO");
  c.para(
    "EL ADQUIRENTE proyecta constituir en Chile la sociedad \"Fixgo SpA\" (en formación), cuyo giro será operar una plataforma " +
    "digital de intermediación de servicios para el hogar. Encarga al PRESTADOR el desarrollo del software base para aportarlo " +
    "como activo intangible. El PRESTADOR se obliga a desarrollar y ceder FIXGO (Cliente) — app Android + iOS + web, " +
    "frontend, backend, base de datos, autenticación, geolocalización, pagos y mapas en tiempo real. El alcance corresponde " +
    "exclusivamente al módulo Cliente. Total: USD 1.500.",
    P
  );
  c.gap(3);

  T("SEGUNDA — PRECIO Y PAGOS PARCIALIZADOS");
  c.para(
    `Precio total USD ${TOTAL_USD.toLocaleString("en-US")} pagaderos por transferencia USDT BEP20 a la cuenta CoinEx del PRESTADOR (e38377066@gmail.com): ` +
    `(a) ANTICIPO ya efectuado USD ${PAGADO_INICIAL_USD.toLocaleString("en-US")} a la suscripción, sirviendo de suficiente recibo; ` +
    `(b) SALDO USD ${SALDO_USD.toLocaleString("en-US")} pagaderos PARCIALIZADAMENTE según hitos funcionales acordados; ` +
    "(c) PLAZO MÁXIMO TRES (3) MESES desde la emisión (23-04-2026), " +
    "venciendo el 23-07-2026. Cada transferencia se acredita por hash on-chain como comprobante suficiente del pago parcial.",
    P
  );
  c.gap(3);

  T("TERCERA — CESIÓN DE IP CONDICIONADA AL PAGO TOTAL");
  c.para(
    "El PRESTADOR cede al ADQUIRENTE, en forma TOTAL, EXCLUSIVA, PERPETUA, IRREVOCABLE y MUNDIAL, todos los derechos patrimoniales " +
    "sobre los entregables (código fuente y objeto, documentación, diseños, BD, marcas y desarrollos derivados), incluyendo " +
    "reproducción, distribución, modificación, comunicación pública, sublicencia y comercialización. Mientras el saldo no esté " +
    "pagado, el ADQUIRENTE recibe una LICENCIA de uso, inspección y deployment no exclusiva, perfeccionándose la cesión plena " +
    "de pleno derecho una vez verificado el pago total. El ADQUIRENTE podrá entonces aportar estos derechos a Fixgo SpA.",
    P
  );
  c.gap(3);

  T("CUARTA — INDEPENDENCIA P2P Y TRATAMIENTO TRIBUTARIO");
  c.para(
    "Contrato P2P entre personas naturales independientes; NO existe relación laboral, subordinación ni vínculo societario. " +
    "El PRESTADOR actúa como contratista independiente y asume sus obligaciones tributarias en Cuba. Las partes reconocen que: " +
    "(i) los servicios se prestan ÍNTEGRAMENTE desde Cuba sin presencia física en Chile; (ii) es una venta única, no habitual, " +
    "de software a medida con cesión total de IP, NO un servicio digital recurrente del Art. 8 letra n) DL 825; (iii) por " +
    "naturaleza P2P y ámbito territorial del DL 825, NO está afecta a IVA chileno; (iv) el PRESTADOR no requiere RUT chileno.",
    P
  );
  c.gap(3);

  T("QUINTA — CONFIDENCIALIDAD, GARANTÍAS Y RESPONSABILIDAD");
  c.para(
    "Confidencialidad por cinco (5) años sobre información técnica y comercial. El PRESTADOR garantiza originalidad y no " +
    "infracción de derechos de terceros; garantía técnica por defectos: 30 días desde la entrega final aceptada. " +
    "Responsabilidad máxima del PRESTADOR: monto efectivamente pagado por el ADQUIRENTE.",
    P
  );
  c.gap(3);

  T("SEXTA — LEY APLICABLE, JURISDICCIÓN Y FIRMA");
  c.para(
    "Se rige por legislación chilena respecto del ADQUIRENTE y cubana respecto del PRESTADOR. Controversias por mediación " +
    "directa; en su defecto arbitraje CCI o tribunales ordinarios de Santiago, Chile a elección del demandante. Entra en vigor " +
    "desde su firma, perfeccionada por firma electrónica simple conforme a Ley 19.799 de Chile y práctica internacional.",
    P
  );

  await signatureBlock(c, pdf, PRESTADOR.name, PRESTADOR.meta, ADQUIRENTE.name, ADQUIRENTE.meta, SIG_CONTRATO);
  return await pdf.save();
}

/* =========================================================== */
/*  2) ORDEN DE TRABAJO                                        */
/* =========================================================== */
async function buildOrden() {
  const { pdf, ...fonts } = await newDoc("Orden de Trabajo FX-2026-OC001");
  const page = pdf.addPage([PAGE.w, PAGE.h]);
  const c = new Cursor(page, fonts);
  header(c, "ORDEN DE TRABAJO Y COMPRA  —  DESARROLLO DE SOFTWARE", "FX-2026-OC001", FECHA_EMISION);

  // Bloques de partes
  const colW = (PAGE.w - M.l - M.r - 20) / 2;
  c.txt("SOLICITANTE / ADQUIRENTE", { bold: true, size: 9, x: M.l }); c.txt("PROVEEDOR / PRESTADOR", { bold: true, size: 9, x: M.l + colW + 20 });
  c.y -= 12;
  const lA = [ADQUIRENTE.name, ...ADQUIRENTE.meta, "Persona natural — Fundador Fixgo SpA (en formación)"];
  const lB = [PRESTADOR.name, ...PRESTADOR.meta, "Desarrollador de software freelance"];
  for (let i = 0; i < Math.max(lA.length, lB.length); i++) {
    if (lA[i]) c.page.drawText(lA[i], { x: M.l, y: c.y, size: 8, font: fonts.helv, color: COL.text });
    if (lB[i]) c.page.drawText(lB[i], { x: M.l + colW + 20, y: c.y, size: 8, font: fonts.helv, color: COL.text });
    c.y -= 11;
  }
  c.gap(6);
  c.line({ pdf });

  c.txt("OBJETO DE LA ORDEN", { bold: true, size: 10 }); c.y -= 14;
  c.para(
    "Por la presente, el SOLICITANTE encarga formalmente al PROVEEDOR la ejecución del desarrollo de software detallado a " +
    "continuación, conforme a las especificaciones técnicas y comerciales acordadas en el Contrato P2P FX-2026-C001 de fecha " +
    "23 de abril de 2026.",
    { pdf }
  );
  c.gap(6);

  c.txt("DETALLE DE LOS TRABAJOS ENCARGADOS", { bold: true, size: 10 }); c.y -= 14;

  // Tabla simple
  function row(desc, cant, precio, total, h = 28) {
    c.ensure(h + 4, pdf);
    const yTop = c.y;
    c.page.drawRectangle({ x: M.l, y: yTop - h, width: PAGE.w - M.l - M.r, height: h, borderColor: COL.line, borderWidth: 0.5 });
    const lines = wrap(desc, fonts.helv, 8, 320);
    let ly = yTop - 11;
    for (const ln of lines.slice(0, 3)) { c.page.drawText(ln, { x: M.l + 6, y: ly, size: 8, font: fonts.helv, color: COL.text }); ly -= 9; }
    c.page.drawText(String(cant), { x: M.l + 350, y: yTop - 17, size: 9, font: fonts.helv, color: COL.text });
    c.page.drawText(precio, { x: M.l + 395, y: yTop - 17, size: 9, font: fonts.helv, color: COL.text });
    c.page.drawText(total, { x: M.l + 460, y: yTop - 17, size: 9, font: fonts.helvB, color: COL.text });
    c.y = yTop - h - 4;
  }
  // Header tabla
  c.ensure(16, pdf);
  c.page.drawRectangle({ x: M.l, y: c.y - 14, width: PAGE.w - M.l - M.r, height: 14, color: rgb(0.93, 0.7, 0.03) });
  c.page.drawText("DESCRIPCIÓN", { x: M.l + 6, y: c.y - 10, size: 8, font: fonts.helvB, color: COL.text });
  c.page.drawText("CANT.", { x: M.l + 350, y: c.y - 10, size: 8, font: fonts.helvB, color: COL.text });
  c.page.drawText("PRECIO USD", { x: M.l + 395, y: c.y - 10, size: 8, font: fonts.helvB, color: COL.text });
  c.page.drawText("TOTAL", { x: M.l + 460, y: c.y - 10, size: 8, font: fonts.helvB, color: COL.text });
  c.y -= 14;
  row("Aplicación FIXGO (Cliente). App móvil Android + iOS + web responsive. Frontend, backend, base de datos, autenticación, geolocalización, pagos y mapas en tiempo real. Cesión total de IP.", "1", "$1,500.00", "$1,500.00", 36);
  c.gap(4);
  c.page.drawText(`TOTAL ENCARGO:  $1,500.00 USD`, { x: PAGE.w - M.r - 180, y: c.y, size: 11, font: fonts.helvB, color: COL.text }); c.y -= 18;

  c.txt("PLAZOS Y CONDICIONES DE PAGO", { bold: true, size: 10 }); c.y -= 14;
  c.para(
    "Plazo de ejecución: trabajo iniciado en la fecha de emisión de esta orden (23 de abril de 2026) y desarrollado por hitos " +
    "funcionales acordados entre las partes. Forma de entrega: código fuente íntegro mediante repositorio Git privado, builds " +
    "compilados (APK Android e IPA iOS), credenciales de servicios asociados, documentación técnica y manual de despliegue.",
    { pdf }
  );
  c.gap(2);
  c.para(
    "Forma de pago: importe total de USD 1.500 pagado íntegramente en USDT BEP20 vía CoinEx " +
    "(e38377066@gmail.com). Saldo pendiente: USD 0.00. La transferencia se acredita por hash de transacción en cadena.",
    { pdf }
  );
  c.gap(6);

  c.txt("AUTORIZACIÓN", { bold: true, size: 10 }); c.y -= 14;
  c.para(
    "Mediante la firma de la presente orden, el SOLICITANTE autoriza expresamente al PROVEEDOR a iniciar y ejecutar los trabajos, y " +
    "declara que el importe total de los entregables ha sido pagado íntegramente y se compromete a recibirlos conforme a lo aquí establecido.",
    { pdf }
  );

  await signatureBlock(c, pdf, PRESTADOR.name, PRESTADOR.meta, ADQUIRENTE.name, ADQUIRENTE.meta, SIG_ORDEN);
  return await pdf.save();
}

/* =========================================================== */
/*  3) ACTA DE ENTREGA Y ACEPTACIÓN                            */
/* =========================================================== */
async function buildActa() {
  const { pdf, ...fonts } = await newDoc("Acta de Entrega FX-2026-AE001");
  const page = pdf.addPage([PAGE.w, PAGE.h]);
  const c = new Cursor(page, fonts);
  header(c, "ACTA DE ENTREGA Y ACEPTACIÓN  —  SOFTWARE FIXGO (CLIENTE)", "FX-2026-AE001", FECHA_EMISION);

  c.txt("COMPARECIENTES", { bold: true, size: 11 }); c.y -= 14;
  c.para(
    "De una parte, MANUEL ALEX LEZCANO PÉREZ, CI N° 05060269368, domiciliado en Mario Muñoz 13, Colón, Matanzas, Cuba, en calidad " +
    "de PRESTADOR. De otra parte, JONATHAN SONNY CORTEZ LAVERIANO, RUT 23.339.727-K, domiciliado en Santiago Concha 1520, " +
    "Santiago, RM, Chile, en calidad de ADQUIRENTE.",
    { pdf }
  );
  c.gap(6);

  c.txt("ANTECEDENTES", { bold: true, size: 10 }); c.y -= 14;
  c.para(
    "Que con fecha 23 de abril de 2026, las partes suscribieron el Contrato P2P FX-2026-C001 y la Orden de Trabajo FX-2026-OC001, " +
    "en virtud de los cuales el PRESTADOR se obligó a desarrollar y entregar al ADQUIRENTE el software descrito a continuación, con " +
    "cesión total de propiedad intelectual condicionada al pago íntegro del precio.",
    { pdf }
  );
  c.gap(6);

  c.txt("ENTREGABLES RECIBIDOS POR EL ADQUIRENTE", { bold: true, size: 10 }); c.y -= 14;
  const entregables = [
    "Código fuente completo de la aplicación FIXGO (cliente): repositorio Git con frontend React + Vite + TypeScript, backend Express + Drizzle, base de datos PostgreSQL, integración Capacitor para Android/iOS.",
    "Builds compilados: APK Android y proyecto iOS listo para firma y publicación en App Store.",
    "Build web responsive desplegable (Vite production build).",
    "Esquema de base de datos PostgreSQL (Drizzle migrations).",
    "Credenciales y archivos de configuración de servicios externos asociados al desarrollo.",
    "Documentación técnica: arquitectura, despliegue y guía de mantenimiento.",
  ];
  for (const it of entregables) {
    c.ensure(20, pdf);
    c.page.drawText("•", { x: M.l, y: c.y, size: 9, font: fonts.helvB, color: COL.primary });
    const lines = wrap(it, fonts.helv, 9, PAGE.w - M.l - M.r - 14);
    for (const ln of lines) {
      c.ensure(11, pdf);
      c.page.drawText(ln, { x: M.l + 12, y: c.y, size: 9, font: fonts.helv, color: COL.text });
      c.y -= 11;
    }
    c.y -= 2;
  }
  c.gap(4);

  c.txt("DECLARACIÓN DE ACEPTACIÓN", { bold: true, size: 10 }); c.y -= 14;
  c.para(
    "EL ADQUIRENTE declara haber recibido los entregables individualizados precedentemente, los cuales han sido revisados, probados y " +
    "se encuentran conformes con las especificaciones acordadas en el Contrato y la Orden de Trabajo. Las partes reconocen que el " +
    "perfeccionamiento pleno de la cesión de propiedad intelectual queda condicionado al pago íntegro del precio convenido.",
    { pdf }
  );
  c.gap(6);

  c.txt("ESTADO DE PAGO", { bold: true, size: 10 }); c.y -= 14;
  c.para(
    `Total convenido: USD ${TOTAL_USD.toLocaleString("en-US")}.  Pago inicial recibido a la fecha del presente acto: USD ${PAGADO_INICIAL_USD.toLocaleString("en-US")} ` +
    "(anticipo, recibido vía USDT BEP20 a la cuenta CoinEx del PRESTADOR — e38377066@gmail.com). Saldo pendiente: USD " +
    `${SALDO_USD.toLocaleString("en-US")}, pagadero de forma parcializada según avances verificables del desarrollo, dentro del ` +
    `plazo máximo de TRES (3) MESES contado desde la fecha de emisión, venciendo el ${FECHA_PLAZO}. Los hashes de transacción ` +
    "correspondientes formarán parte integrante del expediente del presente acto.",
    { pdf }
  );
  c.gap(6);

  c.txt("CIERRE", { bold: true, size: 10 }); c.y -= 14;
  c.para(
    "Con la suscripción de la presente Acta, las partes formalizan la entrega de los trabajos desarrollados a la fecha; subsisten " +
    "las obligaciones de pago parcializado conforme al Contrato P2P FX-2026-C001 y la garantía técnica de 30 días sobre defectos " +
    "computada desde la aceptación final una vez completado el pago íntegro.",
    { pdf }
  );

  await signatureBlock(c, pdf, PRESTADOR.name, PRESTADOR.meta, ADQUIRENTE.name, ADQUIRENTE.meta, SIG_ACTA);
  return await pdf.save();
}

/* =========================================================== */
/*  4) FACTURAS DIVIDIDAS                                      */
/* =========================================================== */
async function buildFactura({ docNum, titleApp, descripcion, montoApp, pagadoApp }) {
  const { pdf, ...fonts } = await newDoc(`Factura ${docNum}`);
  const page = pdf.addPage([PAGE.w, PAGE.h]);
  const c = new Cursor(page, fonts);
  header(c, `FACTURA COMERCIAL  —  ${titleApp}`, docNum, FECHA_EMISION);

  c.para("Moneda: USD  |  Pago parcializado por avance — plazo máximo 3 meses", { italic: true, size: 9, color: COL.muted, pdf });
  c.gap(6);

  // Bloques emisor/cliente
  const colW = (PAGE.w - M.l - M.r - 20) / 2;
  c.txt("EMISOR / ISSUER", { bold: true, size: 9, x: M.l }); c.txt("CLIENTE / BILL TO", { bold: true, size: 9, x: M.l + colW + 20 });
  c.y -= 12;
  const lA = [PRESTADOR.name, "Desarrollador de Software Freelance", ...PRESTADOR.meta.slice(0)];
  const lB = [ADQUIRENTE.name, "Persona natural — Fundador Fixgo SpA (en formación)", ...ADQUIRENTE.meta.slice(0)];
  for (let i = 0; i < Math.max(lA.length, lB.length); i++) {
    if (lA[i]) c.page.drawText(lA[i], { x: M.l, y: c.y, size: 8, font: fonts.helv, color: COL.text });
    if (lB[i]) c.page.drawText(lB[i], { x: M.l + colW + 20, y: c.y, size: 8, font: fonts.helv, color: COL.text });
    c.y -= 11;
  }
  c.gap(6);
  c.line({ pdf });

  c.txt("CONCEPTO / CONCEPT", { bold: true, size: 10 }); c.y -= 14;
  c.para(
    "Servicios profesionales independientes de desarrollo de software ejecutados ÍNTEGRAMENTE desde Cuba por persona natural " +
    "freelance, en virtud de acuerdo privado P2P (peer-to-peer) celebrado entre dos personas naturales independientes. El cliente " +
    "recibe los entregables a título personal con el propósito de aportarlos posteriormente como activo intangible a la sociedad " +
    "\"Fixgo SpA\" (en proceso de constitución en Chile).",
    { pdf }
  );
  c.gap(6);

  // Tabla de la app facturada
  c.ensure(16, pdf);
  c.page.drawRectangle({ x: M.l, y: c.y - 14, width: PAGE.w - M.l - M.r, height: 14, color: rgb(0.93, 0.7, 0.03) });
  c.page.drawText("DESCRIPCIÓN / DESCRIPTION", { x: M.l + 6, y: c.y - 10, size: 8, font: fonts.helvB, color: COL.text });
  c.page.drawText("CANT.", { x: M.l + 350, y: c.y - 10, size: 8, font: fonts.helvB, color: COL.text });
  c.page.drawText("PRECIO USD", { x: M.l + 395, y: c.y - 10, size: 8, font: fonts.helvB, color: COL.text });
  c.page.drawText("TOTAL", { x: M.l + 460, y: c.y - 10, size: 8, font: fonts.helvB, color: COL.text });
  c.y -= 14;

  c.ensure(40, pdf);
  const yTop = c.y;
  const h = 40;
  c.page.drawRectangle({ x: M.l, y: yTop - h, width: PAGE.w - M.l - M.r, height: h, borderColor: COL.line, borderWidth: 0.5 });
  const lines = wrap(descripcion, fonts.helv, 8, 320);
  let ly = yTop - 11;
  for (const ln of lines.slice(0, 4)) { c.page.drawText(ln, { x: M.l + 6, y: ly, size: 8, font: fonts.helv, color: COL.text }); ly -= 9; }
  c.page.drawText("1", { x: M.l + 350, y: yTop - 17, size: 9, font: fonts.helv, color: COL.text });
  c.page.drawText(`$${montoApp.toLocaleString("en-US")}.00`, { x: M.l + 395, y: yTop - 17, size: 9, font: fonts.helv, color: COL.text });
  c.page.drawText(`$${montoApp.toLocaleString("en-US")}.00`, { x: M.l + 460, y: yTop - 17, size: 9, font: fonts.helvB, color: COL.text });
  c.y = yTop - h - 6;

  // Totales
  const saldoApp = montoApp - pagadoApp;
  c.ensure(70, pdf);
  const tx = PAGE.w - M.r - 220;
  function totalRow(label, value, bold = false, color = COL.text) {
    c.page.drawText(label, { x: tx, y: c.y, size: 9, font: bold ? fonts.helvB : fonts.helv, color });
    c.page.drawText(value, { x: tx + 130, y: c.y, size: 9, font: bold ? fonts.helvB : fonts.helv, color });
    c.y -= 13;
  }
  totalRow("Subtotal:", `$${montoApp.toLocaleString("en-US")}.00 USD`);
  totalRow("Impuestos (IVA):", "No aplica");
  totalRow("TOTAL FACTURA:", `$${montoApp.toLocaleString("en-US")}.00 USD`, true);
  c.y -= 4;
  totalRow("Pagado 100%:", `$${pagadoApp.toLocaleString("en-US")}.00 USD`, false, rgb(0.0, 0.5, 0.1));
  totalRow("Saldo pendiente:", `$${saldoApp.toLocaleString("en-US")}.00 USD`, true, rgb(0.75, 0.4, 0.0));

  c.gap(6);
  c.txt("CONDICIONES DE PAGO", { bold: true, size: 10 }); c.y -= 14;
  c.para(
    `Esta factura corresponde exclusivamente a ${titleApp} por un importe total de USD ${montoApp.toLocaleString("en-US")}. ` +
    `El importe total ha sido pagado íntegramente, por lo que el saldo pendiente es de USD 0.00.`,
    { pdf }
  );
  c.gap(4);

  c.txt("DATOS DE PAGO", { bold: true, size: 10 }); c.y -= 14;
  c.para(
    "Beneficiario: Manuel Alex Lezcano Pérez  |  Método: Criptomoneda USDT (Tether)  |  Red: BEP20 (Binance Smart Chain)  |  " +
    "Exchange: CoinEx  |  Email asociado: e38377066@gmail.com",
    { pdf }
  );
  c.gap(4);

  c.txt("DECLARACIÓN LEGAL", { bold: true, size: 9 }); c.y -= 12;
  c.para(
    "NATURALEZA: VENTA ÚNICA Y NO HABITUAL de software a medida con CESIÓN DE PROPIEDAD INTELECTUAL del emisor (persona natural " +
    "residente en Cuba) al adquirente (persona natural residente en Chile), bajo contrato privado P2P. La operación NO se encuentra " +
    "afecta a IVA chileno (DL 825) por: (i) servicios prestados ÍNTEGRAMENTE en el extranjero (Cuba); (ii) NO constituye \"servicio " +
    "digital\" del Art. 8 letra n) DL 825; (iii) transferencia de bien intangible entre personas naturales no contribuyentes de IVA; " +
    "(iv) emisor sin RUT chileno. IMPUESTO ADICIONAL Art. 59 DL 824: no aplica retención (adquirente persona natural, no agente " +
    "retenedor empresarial). El emisor declara que tributará este ingreso conforme a la legislación cubana aplicable.",
    { pdf, size: 8.5 }
  );

  await signatureBlock(c, pdf, PRESTADOR.name, PRESTADOR.meta, ADQUIRENTE.name, ADQUIRENTE.meta, SIG_FACTURA);
  return await pdf.save();
}

/* =========================================================== */
/*  RUN                                                        */
/* =========================================================== */
const tasks = [
  ["Contrato_P2P_FX-2026-C001_FIXGO_FIRMADO.pdf", buildContrato],
  ["Orden_Trabajo_FX-2026-OC001_FIXGO_FIRMADO.pdf", buildOrden],
  ["Acta_Entrega_FX-2026-AE001_FIXGO_FIRMADO.pdf", buildActa],
  ["Factura_FX-2026-001A_FIXGO_Cliente_FIRMADO.pdf", () => buildFactura({
    docNum: "FX-2026-001A",
    titleApp: "FIXGO (Cliente)",
    descripcion: "Aplicación FIXGO (Cliente). Desarrollo de app móvil Android + iOS + web responsive. Frontend, backend, base de datos, autenticación, geolocalización, pagos y mapas en tiempo real. Cesión total de IP del módulo Cliente.",
    montoApp: 1500,
    pagadoApp: 1500,
  })],
  ["Factura_FX-2026-001B_FIXGO_Driver_FIRMADO.pdf", () => buildFactura({
    docNum: "FX-2026-001B",
    titleApp: "FIXGO DRIVER (Trabajador)",
    descripcion: "Aplicación FIXGO DRIVER. Desarrollo de app móvil Android + iOS para trabajadores: GPS en tiempo real, gestión de servicios, cobros, saldo y reportes. Cesión total de IP del módulo Driver.",
    montoApp: 1500,
    pagadoApp: 1500,
  })],
];

for (const [name, fn] of tasks) {
  const bytes = await fn();
  const out = path.join(OUT, name);
  await fs.writeFile(out, bytes);
  console.log("OK:", out, bytes.length, "bytes");
}

console.log("\nListo. Archivos en", OUT);
