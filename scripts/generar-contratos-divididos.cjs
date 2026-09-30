/**
 * Genera 2 contratos P2P separados (Fixgo Cliente y Fixgo Driver),
 * cada uno de 1 pagina A4, USD 1.500, conservando las firmas escaneadas
 * del contrato original FX-2026-C001 firmado.
 */
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FIRMA_DIR = path.join(ROOT, ".local", "firmas-extraidas");
const FIRMA_MANUEL = path.join(FIRMA_DIR, "alex_firma.png");
const FIRMA_JONATHAN = path.join(FIRMA_DIR, "jonathan_firma_user.png");
const OUTDIR = path.join(ROOT, "attached_assets");

const COMUN = {
  fecha: "23 de abril de 2026",
  prestador: {
    nombre: "MANUEL ALEX LEZCANO PÉREZ",
    rol: "EL PRESTADOR",
    ci: "05060269368",
    tel: "+53 5555 6068",
    dir: "Mario Muñoz 13, Colón, Matanzas, Cuba",
    mail: "manuellezkano@gmail.com",
  },
  adquirente: {
    nombre: "JONATHAN SONNY CORTEZ LAVERIANO",
    rol: "EL ADQUIRENTE",
    rut: "23.339.727-K",
    dir: "Santiago Concha 1520, Santiago, RM, Chile",
    mail: "fixxer.sap@gmail.com",
  },
};

const CONTRATOS = [
  {
    archivo: "Contrato_P2P_Fixgo_Cliente.pdf",
    docN: "FX-2026-C001A",
    titulo: "FIXGO (Cliente)",
    objeto:
      "FIXGO (Cliente) — aplicación móvil Android + iOS y web responsive: frontend, backend, base de datos, autenticación, geolocalización, pagos y mapas en tiempo real. Incluye cesión total de propiedad intelectual sobre el módulo Cliente.",
  },
  {
    archivo: "Contrato_P2P_Fixgo_Driver.pdf",
    docN: "FX-2026-C001B",
    titulo: "FIXGO DRIVER (Trabajador)",
    objeto:
      "FIXGO DRIVER (Trabajador) — aplicación móvil Android + iOS para trabajadores: GPS en tiempo real, gestión de servicios, cobros, saldo y reportes. Incluye cesión total de propiedad intelectual sobre el módulo Driver.",
  },
];

const PRECIO = "USD 1.500";
const PRECIO_LETRAS = "mil quinientos dólares estadounidenses";

function generar({ archivo, docN, titulo, objeto }) {
  const out = path.join(OUTDIR, archivo);
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 36, bottom: 36, left: 42, right: 42 },
    info: {
      Title: `Contrato P2P ${titulo} ${docN}`,
      Author: "Fixgo SpA (en formación)",
      Subject: "Contrato P2P de desarrollo de software",
    },
  });
  doc.pipe(fs.createWriteStream(out));

  // ===== HEADER =====
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#EAB308").text("FIXGO", { align: "left" });
  doc.moveDown(0.1);
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#000")
    .text(`CONTRATO PRIVADO P2P — ${titulo}`, { align: "left" });
  doc.font("Helvetica").fontSize(8).fillColor("#444").text(
    `Doc N°: ${docN}  |  Fecha de emisión: ${COMUN.fecha}  |  Santiago, Chile / Colón, Cuba`,
  );
  doc
    .moveTo(42, doc.y + 4)
    .lineTo(553, doc.y + 4)
    .strokeColor("#EAB308")
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.6);

  // Helper para parrafo justificado
  const par = (texto, opts = {}) => {
    doc
      .font("Helvetica")
      .fontSize(8.4)
      .fillColor("#000")
      .text(texto, { align: "justify", lineGap: 1.2, ...opts });
    doc.moveDown(0.25);
  };
  const clausula = (titulo) => {
    doc.font("Helvetica-Bold").fontSize(8.4).fillColor("#000").text(titulo);
  };

  // ===== COMPARECIENTES =====
  par(
    `De una parte, ${COMUN.prestador.nombre}, persona natural, desarrollador de software freelance, CI cubano N° ${COMUN.prestador.ci}, domicilio ${COMUN.prestador.dir} ("${COMUN.prestador.rol}"). De otra parte, ${COMUN.adquirente.nombre}, persona natural, RUT ${COMUN.adquirente.rut}, domicilio ${COMUN.adquirente.dir} ("${COMUN.adquirente.rol}"). Ambos, actuando a título estrictamente personal y con plena capacidad legal, otorgan el presente contrato según las cláusulas siguientes.`,
  );

  // ===== CLAUSULAS =====
  clausula("PRIMERA — ANTECEDENTES Y OBJETO");
  par(
    `EL ADQUIRENTE proyecta constituir en Chile la sociedad "FIXGO SpA" (en formación), cuyo giro será operar una plataforma digital de intermediación de servicios para el hogar. Encarga al PRESTADOR el desarrollo del software base para aportarlo posteriormente como activo intangible a dicha sociedad. Por el presente contrato, el PRESTADOR se obliga a desarrollar, entregar y ceder al ADQUIRENTE la siguiente aplicación: ${objeto}`,
  );

  clausula("SEGUNDA — PRECIO Y FORMA DE PAGO");
  par(
    `El ADQUIRENTE pagará al PRESTADOR la suma de ${PRECIO} (${PRECIO_LETRAS}) por el desarrollo y cesión de los entregables descritos en la cláusula PRIMERA. El pago se efectuará mediante transferencia de criptomoneda USDT en red BEP20 (Binance Smart Chain), a la cuenta CoinEx del PRESTADOR (e38377066@gmail.com), de forma parcializada según hitos funcionales acordados, dentro del plazo máximo de TRES (3) MESES contado desde la fecha de emisión, venciendo el 23 de julio de 2026. Cada transferencia se acreditará por hash on-chain como comprobante suficiente del pago parcial. Las partes reconocen que el ANTICIPO proporcional ya pagado dentro del proyecto global FX-2026 se imputa a la presente operación.`,
  );

  clausula("TERCERA — CESIÓN DE PROPIEDAD INTELECTUAL CONDICIONADA AL PAGO TOTAL");
  par(
    `El PRESTADOR cede al ADQUIRENTE, en forma TOTAL, EXCLUSIVA, PERPETUA, IRREVOCABLE y MUNDIAL, todos los derechos patrimoniales sobre los entregables (código fuente y objeto, documentación, diseños, interfaces, bases de datos, marcas, nombres asociados y desarrollos derivados), incluyendo reproducción, distribución, modificación, comunicación pública, transformación, sublicencia y comercialización por cualquier medio. Mientras el saldo no esté pagado, el ADQUIRENTE recibe una LICENCIA de uso, inspección y deployment no exclusiva, perfeccionándose la cesión plena de pleno derecho una vez verificado el pago total. EL ADQUIRENTE queda facultado para aportar estos derechos a "FIXGO SpA" una vez constituida.`,
  );

  clausula("CUARTA — INDEPENDENCIA P2P Y TRATAMIENTO TRIBUTARIO");
  par(
    `Contrato P2P entre dos personas naturales independientes; NO existe relación laboral, subordinación, exclusividad ni vínculo societario. El PRESTADOR actúa como contratista independiente y asume sus obligaciones tributarias bajo la legislación cubana. Las partes reconocen que: (i) los servicios se prestan ÍNTEGRAMENTE desde Cuba, sin presencia física en Chile; (ii) la operación es una venta única, no habitual, de software a medida con cesión total de IP, NO un servicio digital recurrente del Art. 8 letra n) DL 825; (iii) por su naturaleza P2P entre no contribuyentes de IVA y por el ámbito territorial del DL 825, NO se encuentra afecta a IVA chileno; (iv) el PRESTADOR carece de RUT chileno y no tiene obligación de inicio de actividades en Chile.`,
  );

  clausula("QUINTA — CONFIDENCIALIDAD, GARANTÍAS Y RESPONSABILIDAD");
  par(
    `Las partes mantendrán confidencialidad sobre la información técnica y comercial intercambiada por cinco (5) años. El PRESTADOR garantiza que los entregables son originales y no infringen derechos de terceros; otorga garantía técnica por defectos de 30 días desde la entrega final aceptada. La responsabilidad máxima del PRESTADOR queda limitada al monto efectivamente pagado por el ADQUIRENTE bajo este contrato.`,
  );

  clausula("SEXTA — LEY APLICABLE, JURISDICCIÓN Y FIRMA");
  par(
    `El contrato se rige por la legislación chilena respecto del ADQUIRENTE y cubana respecto del PRESTADOR. Las controversias se resolverán por mediación directa; en su defecto, por arbitraje conforme a reglas de la CCI o, alternativamente, ante los tribunales ordinarios de Santiago, Chile, a elección del demandante. Entra en vigor desde su firma, perfeccionada por firma electrónica simple conforme a Ley 19.799 de Chile y práctica internacional para contratos a distancia entre jurisdicciones distintas.`,
  );

  // ===== FIRMAS =====
  doc.moveDown(0.4);

  // Layout firmas en 2 columnas
  const yFirmas = doc.y;
  const colWidth = 245;
  const colLeft = 42;
  const colRight = 42 + colWidth + 21;

  // FIRMA IZQUIERDA: Manuel
  doc.image(FIRMA_MANUEL, colLeft, yFirmas, { fit: [colWidth, 50] });
  // FIRMA DERECHA: Jonathan
  doc.image(FIRMA_JONATHAN, colRight, yFirmas, { fit: [colWidth, 50] });

  // Linea bajo firmas
  const yLinea = yFirmas + 52;
  doc.moveTo(colLeft, yLinea).lineTo(colLeft + colWidth, yLinea).strokeColor("#000").lineWidth(0.5).stroke();
  doc.moveTo(colRight, yLinea).lineTo(colRight + colWidth, yLinea).stroke();

  // Datos bajo cada firma
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#000");
  doc.text(COMUN.prestador.nombre, colLeft, yLinea + 3, { width: colWidth });
  doc.text(COMUN.adquirente.nombre, colRight, yLinea + 3, { width: colWidth });

  doc.font("Helvetica").fontSize(7.5).fillColor("#333");
  const yDatos = yLinea + 14;
  doc.text(`CI: ${COMUN.prestador.ci}  |  ${COMUN.prestador.tel}`, colLeft, yDatos, { width: colWidth });
  doc.text(`RUT: ${COMUN.adquirente.rut}`, colRight, yDatos, { width: colWidth });
  doc.text(COMUN.prestador.dir, colLeft, yDatos + 9, { width: colWidth });
  doc.text(COMUN.adquirente.dir, colRight, yDatos + 9, { width: colWidth });
  doc.text(COMUN.prestador.mail, colLeft, yDatos + 18, { width: colWidth });
  doc.text(COMUN.adquirente.mail, colRight, yDatos + 18, { width: colWidth });

  // Footer legal
  const yFooter = yDatos + 36;
  doc
    .font("Helvetica-Oblique")
    .fontSize(6.5)
    .fillColor("#666")
    .text(
      "Documento privado entre personas naturales. Firma electrónica simple — Ley 19.799 de Chile y práctica internacional. Hash y trazabilidad en expediente del emisor.",
      42,
      yFooter,
      { width: 511, align: "center" },
    );

  doc.end();
  return new Promise((resolve) => doc.on("end", () => resolve(out)));
}

(async () => {
  for (const c of CONTRATOS) {
    const f = await generar(c);
    console.log("OK:", f, "(", fs.statSync(f).size, "bytes )");
  }
})();
