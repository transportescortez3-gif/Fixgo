#!/usr/bin/env node
/* eslint-disable */
const PDFDocument = require("pdfkit");
const { PDFDocument: PDFLibDocument } = require("pdf-lib");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "documentos-fixgo");
fs.mkdirSync(OUT_DIR, { recursive: true });

// Firmas escaneadas (mismas que se usan en los demas documentos legales).
const FIRMA_DIR = path.join(__dirname, "..", ".local", "firmas-extraidas");
const FIRMA_JONATHAN = path.join(FIRMA_DIR, "jonathan_firma_final.png");
const FIRMA_ALEX = path.join(FIRMA_DIR, "alex_firma.png");

const COLOR = {
  amarillo: "#EAB308",
  amarilloClaro: "#FEF3C7",
  negro: "#0F0F0F",
  gris: "#4B5563",
  grisClaro: "#E5E7EB",
  grisFondo: "#F9FAFB",
  blanco: "#FFFFFF",
  rojo: "#B91C1C",
  verde: "#15803D",
};

const PAGE = { w: 612, h: 792, mx: 54, my: 56 };
const CONTENT_W = PAGE.w - 2 * PAGE.mx;
const FECHA = new Date().toLocaleDateString("es-CL", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

function nuevoDoc(titulo, archivo) {
  const doc = new PDFDocument({
    size: "LETTER",
    bufferPages: true,
    autoFirstPage: false,
    margins: { top: PAGE.my, bottom: PAGE.my, left: PAGE.mx, right: PAGE.mx },
    info: {
      Title: titulo,
      Author: "Servicios Tecnologicos Fixgo SpA",
      Subject: titulo,
      Keywords: "Fixgo, SaaS, Wallet, SII, Chile",
    },
  });
  doc.pipe(fs.createWriteStream(path.join(OUT_DIR, archivo)));
  return doc;
}

function nuevaPagina(doc, titulo, subtitulo) {
  doc.addPage();
  // header negro
  doc.save();
  doc.rect(0, 0, PAGE.w, 70).fill(COLOR.negro);
  doc
    .fillColor(COLOR.amarillo)
    .font("Helvetica-Bold")
    .fontSize(20)
    .text("FIXGO", PAGE.mx, 18, { lineBreak: false });
  doc
    .fillColor(COLOR.blanco)
    .font("Helvetica")
    .fontSize(8)
    .text("Servicios Tecnologicos Fixgo SpA  |  appfixxer.com", PAGE.mx, 46, {
      lineBreak: false,
    });
  doc
    .fillColor(COLOR.amarillo)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(titulo, PAGE.mx, 18, { width: CONTENT_W, align: "right", lineBreak: false });
  doc
    .fillColor(COLOR.blanco)
    .font("Helvetica")
    .fontSize(8)
    .text(subtitulo + "  ·  " + FECHA, PAGE.mx, 34, {
      width: CONTENT_W,
      align: "right",
      lineBreak: false,
    });
  doc.restore();
  doc.y = 90;
}

function pintarFooters(doc) {
  const total = doc.bufferedPageRange().count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(i);
    const y = PAGE.h - 36;
    doc.save();
    doc
      .strokeColor(COLOR.grisClaro)
      .lineWidth(0.5)
      .moveTo(PAGE.mx, y)
      .lineTo(PAGE.w - PAGE.mx, y)
      .stroke();
    doc
      .fillColor(COLOR.gris)
      .font("Helvetica")
      .fontSize(7.5)
      .text(
        "Servicios Tecnologicos Fixgo SpA  |  appfixxer.com  |  Documento de uso interno y legal",
        PAGE.mx,
        y + 6,
        { width: CONTENT_W, align: "left", lineBreak: false }
      );
    doc
      .fillColor(COLOR.gris)
      .font("Helvetica")
      .fontSize(7.5)
      .text(`Pagina ${i + 1} de ${total}`, PAGE.mx, y + 6, {
        width: CONTENT_W,
        align: "right",
        lineBreak: false,
      });
    doc.restore();
  }
}

function tituloSec(doc, texto) {
  doc.y += 4;
  const y = doc.y;
  doc.save();
  doc.rect(PAGE.mx, y, 3, 14).fill(COLOR.amarillo);
  doc.restore();
  doc
    .fillColor(COLOR.negro)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(texto, PAGE.mx + 10, y - 1, { width: CONTENT_W - 10, lineBreak: false });
  doc.y = y + 18;
}

function parrafo(doc, texto, opts = {}) {
  doc
    .fillColor(opts.color || COLOR.negro)
    .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(opts.size || 9.5)
    .text(texto, PAGE.mx, doc.y, {
      align: opts.align || "justify",
      width: CONTENT_W,
      lineGap: 1.5,
    });
  doc.y += 4;
}

function bullet(doc, texto) {
  const x = PAGE.mx + 4;
  const y0 = doc.y;
  doc.save();
  doc.circle(x, y0 + 4.5, 1.5).fill(COLOR.amarillo);
  doc.restore();
  doc
    .fillColor(COLOR.negro)
    .font("Helvetica")
    .fontSize(9.5)
    .text(texto, x + 7, y0, {
      align: "justify",
      width: CONTENT_W - 11,
      lineGap: 1.2,
    });
  doc.y += 2;
}

function caja(doc, x, y, w, h, fill, stroke) {
  doc.save();
  doc.roundedRect(x, y, w, h, 5).fillAndStroke(fill, stroke || fill);
  doc.restore();
}

function cajaTexto(doc, x, y, w, h, titulo, sub, opts = {}) {
  caja(doc, x, y, w, h, opts.fill || COLOR.amarilloClaro, opts.stroke || COLOR.amarillo);
  const tColor = opts.colorTitulo || COLOR.negro;
  const sColor = opts.colorSub || COLOR.gris;
  doc
    .fillColor(tColor)
    .font("Helvetica-Bold")
    .fontSize(opts.tamTitulo || 8.5)
    .text(titulo, x + 4, y + 6, { width: w - 8, align: "center" });
  if (sub) {
    doc
      .fillColor(sColor)
      .font("Helvetica")
      .fontSize(opts.tamSub || 7)
      .text(sub, x + 4, y + 6 + (opts.tamTitulo || 8.5) + 4, {
        width: w - 8,
        align: "center",
        lineGap: 0.5,
      });
  }
}

function flecha(doc, x1, y1, x2, y2, color, dashed) {
  const c = color || COLOR.gris;
  doc.save();
  doc.strokeColor(c).lineWidth(1.3);
  if (dashed) doc.dash(4, { space: 3 });
  doc.moveTo(x1, y1).lineTo(x2, y2).stroke();
  if (dashed) doc.undash();
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 5;
  doc
    .fillColor(c)
    .moveTo(x2, y2)
    .lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6))
    .lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6))
    .closePath()
    .fill();
  doc.restore();
}

function codeBlock(doc, lines) {
  const lineH = 11;
  const pad = 6;
  const h = lines.length * lineH + pad * 2;
  const yStart = doc.y;
  doc.save();
  doc.rect(PAGE.mx, yStart, CONTENT_W, h).fillAndStroke(COLOR.grisFondo, COLOR.grisClaro);
  doc.fillColor(COLOR.negro).font("Courier").fontSize(8.5);
  let yy = yStart + pad;
  for (const ln of lines) {
    doc.text(ln, PAGE.mx + 6, yy, { width: CONTENT_W - 12, lineBreak: false });
    yy += lineH;
  }
  doc.restore();
  // Forzar doc.y a la posicion correcta justo despues del bloque
  doc.y = yStart + h + 6;
}

function firmas(doc, izq, der, pageCtx) {
  // Total alto necesario: 38 (firma) + 8 (gap) + 38 (3 lineas de texto) = ~84
  const altoFirma = 90;
  const yMaxLinea = PAGE.h - PAGE.my - 50;
  // Si el cursor + altoFirma supera el bottom margin, abrir nueva pagina
  if (doc.y + altoFirma > yMaxLinea && pageCtx) {
    nuevaPagina(doc, pageCtx.titulo, pageCtx.subtitulo);
    doc.y += 60; // dejar respirar al inicio
  } else {
    doc.y += 30;
  }
  const y = doc.y; // y = baseline donde va la linea horizontal de firma
  const sigW = 180;
  const sigH = 38;
  // izquierda: firma justo arriba de la linea
  if (izq.firma && fs.existsSync(izq.firma)) {
    try {
      doc.image(izq.firma, PAGE.mx, y - sigH, { fit: [sigW, sigH] });
    } catch (err) {
      console.warn(`No se pudo embebir firma ${izq.nombre}:`, err && err.message);
    }
  }
  doc
    .strokeColor(COLOR.negro)
    .lineWidth(0.7)
    .moveTo(PAGE.mx, y)
    .lineTo(PAGE.mx + 220, y)
    .stroke();
  doc
    .fillColor(COLOR.negro)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(izq.nombre, PAGE.mx, y + 4, { width: 220, lineBreak: false })
    .font("Helvetica")
    .fontSize(8)
    .text(izq.cargo, PAGE.mx, y + 16, { width: 220, lineBreak: false })
    .text(izq.empresa, PAGE.mx, y + 27, { width: 220, lineBreak: false });
  // derecha
  if (der) {
    const xR = PAGE.w - PAGE.mx - 220;
    if (der.firma && fs.existsSync(der.firma)) {
      try {
        doc.image(der.firma, xR + (220 - sigW), y - sigH, { fit: [sigW, sigH] });
      } catch (err) {
        console.warn(`No se pudo embebir firma ${der.nombre}:`, err && err.message);
      }
    }
    doc
      .strokeColor(COLOR.negro)
      .lineWidth(0.7)
      .moveTo(xR, y)
      .lineTo(xR + 220, y)
      .stroke();
    doc
      .fillColor(COLOR.negro)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(der.nombre, xR, y + 4, { width: 220, align: "right", lineBreak: false })
      .font("Helvetica")
      .fontSize(8)
      .text(der.cargo, xR, y + 16, { width: 220, align: "right", lineBreak: false })
      .text(der.empresa, xR, y + 27, { width: 220, align: "right", lineBreak: false });
  }
}

// =====================================================================
// DOCUMENTO 1: FLUJO DE OPERACIONES Y FONDOS
// =====================================================================
function generarFlujoOperaciones() {
  const doc = nuevoDoc("Flujo de Operaciones y Fondos", "01_Flujo_Operaciones_y_Fondos_FIXGO.pdf");

  // ===== PAGINA 1 =====
  nuevaPagina(doc, "Diagrama de Flujo de Operaciones y Fondos", "Documento tecnico-legal");

  tituloSec(doc, "1. Identificacion de la entidad");
  parrafo(
    doc,
    "Razon social: Servicios Tecnologicos Fixgo SpA. Giro: desarrollo y explotacion de software (plataforma SaaS de intermediacion de servicios). Producto: aplicacion movil Fixgo (Android e iOS) que conecta clientes finales con prestadores de servicios independientes (maestros). Modelo: venta de creditos de uso del software (SaaS prepago) cobrados al prestador, sin intermediar pagos entre cliente y prestador."
  );

  tituloSec(doc, "2. Resumen ejecutivo del modelo");
  parrafo(
    doc,
    "Fixgo opera bajo un modelo SaaS + Recargas. La unica entrada de dinero a la cuenta corriente de Servicios Tecnologicos Fixgo SpA proviene de la compra de creditos de uso (recarga de wallet) que el prestador realiza voluntariamente para acceder a oportunidades de trabajo dentro de la plataforma. Fixgo NO recauda, NO custodia y NO procesa el pago que el cliente final realiza al prestador por el servicio prestado."
  );
  bullet(doc, "Fixgo vende: licencia de uso de software prepagada (creditos) al prestador (maestro).");
  bullet(doc, "Fixgo NO vende: el servicio de gasfiteria, electricidad u oficio del prestador.");
  bullet(doc, "Pago cliente -> prestador: se ejecuta fuera de la app (efectivo o transferencia personal).");
  bullet(doc, "Documento tributario: Fixgo emite factura electronica al prestador por la venta de creditos.");

  tituloSec(doc, "3. Diagrama visual del flujo de fondos");

  const yD = doc.y + 4;
  const colW = (CONTENT_W - 24) / 2;
  const colXIzq = PAGE.mx;
  const colXDer = PAGE.mx + colW + 24;

  // Fila 1: PRESTADOR / CLIENTE
  cajaTexto(doc, colXIzq, yD, colW, 36, "PRESTADOR (Maestro)", "Recarga creditos en la app", {
    fill: COLOR.amarilloClaro,
    stroke: COLOR.amarillo,
  });
  cajaTexto(doc, colXDer, yD, colW, 36, "CLIENTE FINAL", "Solicita servicio, paga al prestador en la calle", {
    fill: COLOR.grisFondo,
    stroke: COLOR.gris,
  });

  // Fila 2: Pasarela / Pago directo
  const y2 = yD + 56;
  cajaTexto(doc, colXIzq, y2, colW, 34, "PASARELA DE PAGO", "Webpay / Mercado Pago / Flow", {
    fill: COLOR.blanco,
    stroke: COLOR.gris,
  });
  cajaTexto(
    doc,
    colXDer,
    y2,
    colW,
    34,
    "PAGO DIRECTO PRESTADOR <-> CLIENTE",
    "Fuera de la app. Fixgo NO lo ve, NO lo toca.",
    { fill: "#FEE2E2", stroke: COLOR.rojo, colorTitulo: COLOR.rojo }
  );

  // Fila 3: FIXGO cta
  const y3 = y2 + 54;
  cajaTexto(doc, colXIzq, y3, colW, 36, "FIXGO SpA  -  Cta. Cte.", "Recibe creditos -> emite factura SaaS", {
    fill: COLOR.negro,
    stroke: COLOR.amarillo,
    colorTitulo: COLOR.amarillo,
    colorSub: COLOR.blanco,
  });

  // Fila 4: Wallet / Asignacion
  const y4 = y3 + 56;
  cajaTexto(doc, colXIzq, y4, colW, 34, "WALLET INTERNA (BD)", "Saldo de creditos de uso del prestador", {
    fill: COLOR.amarilloClaro,
    stroke: COLOR.amarillo,
  });
  cajaTexto(doc, colXDer, y4, colW, 34, "ASIGNACION DE TRABAJO", "App entrega contacto del cliente al prestador", {
    fill: COLOR.grisFondo,
    stroke: COLOR.gris,
  });

  // Fila 5: Descuento
  const y5 = y4 + 54;
  const cw = 180;
  const cx = colXIzq + (colW - cw) / 2;
  cajaTexto(doc, cx, y5, cw, 32, "DESCUENTO COMISION", "Al cierre del trabajo se descuenta saldo del wallet", {
    fill: "#DCFCE7",
    stroke: COLOR.verde,
    colorTitulo: COLOR.verde,
  });

  // flechas
  flecha(doc, colXIzq + colW / 2, yD + 36, colXIzq + colW / 2, y2);
  flecha(doc, colXIzq + colW / 2, y2 + 34, colXIzq + colW / 2, y3);
  flecha(doc, colXIzq + colW / 2, y3 + 36, colXIzq + colW / 2, y4);
  flecha(doc, colXIzq + colW, y4 + 17, colXDer, y4 + 17);
  flecha(doc, colXDer + colW / 2, yD + 36, colXDer + colW / 2, y2, COLOR.rojo);
  flecha(doc, colXIzq + colW / 2, y4 + 34, cx + cw / 2, y5, COLOR.verde);

  doc.y = y5 + 42;
  doc
    .fillColor(COLOR.gris)
    .font("Helvetica-Oblique")
    .fontSize(7.5)
    .text(
      "Leyenda: amarillo = activo de Fixgo  |  rojo = pago externo no controlado por Fixgo  |  verde = evento contable interno.",
      PAGE.mx,
      doc.y,
      { width: CONTENT_W, align: "center" }
    );

  // ===== PAGINA 2 =====
  nuevaPagina(doc, "Diagrama de Flujo de Operaciones y Fondos", "Detalle por fase");

  tituloSec(doc, "Fase 1. Registro y validacion del prestador");
  bullet(doc, "El prestador descarga la app Fixgo y crea perfil con RUT, datos de contacto y oficios.");
  bullet(doc, "El backend valida identidad y crea automaticamente una Billetera Virtual (Wallet) interna asociada al RUT del prestador.");
  bullet(doc, "Saldo inicial del wallet: $0 CLP. No hay flujo de dinero en esta fase.");

  tituloSec(doc, "Fase 2. Carga de saldo (unico ingreso para Fixgo)");
  bullet(doc, "El prestador inicia una recarga (ej. $10.000 CLP) desde la app.");
  bullet(doc, "Canal: pasarela de pago integrada (Webpay Plus, Mercado Pago o Flow).");
  bullet(doc, "Flujo de dinero: cuenta del prestador -> pasarela -> cuenta corriente de Servicios Tecnologicos Fixgo SpA.");
  bullet(doc, "La pasarela confirma el pago via webhook firmado y autenticado.");
  bullet(doc, "El backend acredita $10.000 'Creditos de Uso' en el wallet del prestador.");
  bullet(doc, "Fixgo emite automaticamente factura electronica al prestador por 'Venta de creditos / servicios de plataforma' por el monto recargado.");

  tituloSec(doc, "Fase 3. Asignacion de trabajo (intermediacion)");
  bullet(doc, "Un cliente publica una solicitud de servicio en la app.");
  bullet(doc, "El prestador acepta la solicitud y obtiene los datos de contacto del cliente.");
  bullet(doc, "Flujo de dinero: CERO. La app solo conecta dos partes.");
  bullet(doc, "El sistema bloquea preventivamente del wallet del prestador una cantidad equivalente al 10 por ciento del presupuesto estimado, como 'Reserva de comision'.");

  tituloSec(doc, "Fase 4. Pago del servicio (fuera de la app)");
  bullet(doc, "El prestador ejecuta el trabajo en el domicilio del cliente.");
  bullet(doc, "El cliente paga directamente al prestador el monto acordado (efectivo o transferencia personal entre ellos).");
  bullet(doc, "Control Fixgo: Fixgo NO ve, NO toca, NO custodia y NO registra ese dinero.");
  bullet(doc, "Justificacion: el pago es por la prestacion de un servicio entre partes; Fixgo no es parte de esa relacion contractual.");

  tituloSec(doc, "Fase 5. Cierre y descuento de comision");
  bullet(doc, "El prestador (o el cliente) marca el trabajo como 'Terminado' en la app.");
  bullet(doc, "El sistema confirma la transaccion y descuenta definitivamente los creditos reservados del wallet.");
  bullet(doc, "Cada descuento queda registrado en la tabla de log inmutable (wallet_transactions) con: timestamp, prestador, monto, servicio asociado, hash.");
  bullet(doc, "Resultado: el saldo del prestador disminuye, incentivandolo a una nueva recarga (ciclo SaaS).");

  // ===== PAGINA 3 =====
  nuevaPagina(doc, "Diagrama de Flujo de Operaciones y Fondos", "Conclusiones legales");

  tituloSec(doc, "4. Posicion frente al SII");
  parrafo(
    doc,
    "Toda entrada de dinero a la cuenta corriente de Servicios Tecnologicos Fixgo SpA tiene como contrapartida la emision de un documento tributario electronico (factura) al prestador, por el concepto 'Servicios tecnologicos / licencia de uso de plataforma'. No existe ninguna entrada de dinero en la cuenta de Fixgo por concepto del servicio prestado al cliente final."
  );

  tituloSec(doc, "5. Diferenciacion con marketplaces transaccionales");
  parrafo(
    doc,
    "A diferencia de modelos como Uber Eats, Cornershop o Pedidos Ya, donde la plataforma cobra al cliente final, retiene la comision y transfiere el saldo al prestador (recaudando por cuenta de terceros), Fixgo NO procesa el pago del servicio. Fixgo solo vende creditos prepagados al prestador, los cuales son consumidos al recibir trabajos por la plataforma. El modelo es analogo a la venta de minutos de telefonia prepago o de licencias de software."
  );

  tituloSec(doc, "6. Naturaleza juridica de los creditos de uso");
  bullet(doc, "Los creditos NO son dinero ni equivalentes de efectivo.");
  bullet(doc, "Los creditos NO son reembolsables en dinero.");
  bullet(doc, "Los creditos NO son transferibles entre prestadores.");
  bullet(doc, "Los creditos representan un 'derecho de uso' del software, vigente mientras dure la relacion contractual con la plataforma.");
  bullet(doc, "Esto se establece expresamente en los Terminos y Condiciones aceptados al momento del registro.");

  tituloSec(doc, "7. Conclusion");
  parrafo(
    doc,
    "Servicios Tecnologicos Fixgo SpA opera como una empresa de tecnologia (SaaS) que vende creditos de uso de software a sus clientes profesionales (prestadores). No interviene en el cobro del servicio que el prestador ejecuta para su cliente final, no recauda dinero por cuenta de terceros y emite documentacion tributaria por la totalidad de los ingresos que entran a su cuenta corriente. El modelo es plenamente trazable, auditable y consistente con la normativa tributaria chilena vigente."
  );

  firmas(
    doc,
    {
      nombre: "Jonathan Sonny Cortez Laveriano",
      cargo: "Representante Legal",
      empresa: "Servicios Tecnologicos Fixgo SpA",
      firma: FIRMA_JONATHAN,
    },
    null,
    { titulo: "Diagrama de Flujo de Operaciones y Fondos", subtitulo: "Firmas" }
  );

  pintarFooters(doc);
  doc.end();
}

// =====================================================================
// DOCUMENTO 2: ARQUITECTURA TECNICA
// =====================================================================
function generarDocumentoTecnico() {
  const doc = nuevoDoc("Documento Tecnico - Arquitectura Fixgo", "02_Documento_Tecnico_Arquitectura_FIXGO.pdf");

  // ===== PAGINA 1 =====
  nuevaPagina(doc, "Documento Tecnico de Arquitectura", "Sistema FIXGO SaaS");

  tituloSec(doc, "1. Proposito del documento");
  parrafo(
    doc,
    "Este documento describe la arquitectura tecnica del sistema Fixgo y demuestra, desde la perspectiva del software, la separacion fisica y logica entre el dinero que ingresa a Servicios Tecnologicos Fixgo SpA (venta de creditos SaaS) y el dinero que el prestador recibe de su cliente final por el servicio prestado (pago directo, fuera de la plataforma)."
  );

  tituloSec(doc, "2. Diagrama de bloques: separacion de flujos de fondos");

  const yD = doc.y + 4;
  const w1 = 145, w2 = 145, w3 = 145;
  const x1 = PAGE.mx;
  const x3 = PAGE.w - PAGE.mx - w3;
  const x2 = (x1 + w1 + x3) / 2 - w2 / 2;

  // Fila superior
  cajaTexto(doc, x1, yD, w1, 44, "PRESTADOR (Maestro)", "App Android / iOS  |  Wallet interno", {
    fill: COLOR.amarilloClaro, stroke: COLOR.amarillo,
  });
  cajaTexto(doc, x2, yD, w2, 44, "PLATAFORMA FIXGO", "Backend Node + PostgreSQL  |  Nube (Railway)", {
    fill: COLOR.negro, stroke: COLOR.amarillo, colorTitulo: COLOR.amarillo, colorSub: COLOR.blanco,
  });
  cajaTexto(doc, x3, yD, w3, 44, "CLIENTE FINAL", "App Android / iOS", {
    fill: COLOR.grisFondo, stroke: COLOR.gris,
  });

  // Fila intermedia
  const y2 = yD + 80;
  cajaTexto(doc, x1, y2, w1, 44, "Cuenta bancaria PRESTADOR", "Recibe pagos en efectivo o transferencia personal", {
    fill: "#FEE2E2", stroke: COLOR.rojo, colorTitulo: COLOR.rojo,
  });
  cajaTexto(doc, x2, y2, w2, 44, "Cuenta bancaria FIXGO SpA", "Recibe SOLO recargas de creditos via pasarela", {
    fill: COLOR.amarilloClaro, stroke: COLOR.amarillo,
  });
  cajaTexto(doc, x3, y2, w3, 44, "Cuenta bancaria CLIENTE", "Paga directamente al prestador", {
    fill: COLOR.grisFondo, stroke: COLOR.gris,
  });

  // Flechas
  // pago directo prestador <-> cliente (rojo, ambos sentidos)
  flecha(doc, x3, y2 + 22, x1 + w1 + 4, y2 + 22, COLOR.rojo);
  // recarga prestador -> Fixgo (amarillo)
  flecha(doc, x1 + w1, yD + 44, x2, y2 + 8, COLOR.amarillo);
  // cliente -> Fixgo: NO EXISTE (rojo punteado tachado)
  flecha(doc, x3, yD + 44, x2 + w2, y2 + 8, COLOR.rojo, true);

  doc.y = y2 + 56;
  doc
    .fillColor(COLOR.amarillo)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text("Linea amarilla: recarga de creditos (unico ingreso para Fixgo).", PAGE.mx, doc.y, {
      width: CONTENT_W, align: "center", lineBreak: false,
    });
  doc.y += 12;
  doc
    .fillColor(COLOR.rojo)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text("Lineas rojas: pagos por servicio entre cliente y prestador. Fixgo NO interviene.", PAGE.mx, doc.y, {
      width: CONTENT_W, align: "center", lineBreak: false,
    });
  doc.y += 14;
  doc
    .fillColor(COLOR.gris)
    .font("Helvetica-Oblique")
    .fontSize(7.5)
    .text(
      "Conclusion: existen DOS circuitos financieros independientes. Fixgo participa exclusivamente en el circuito SaaS (recarga de creditos) y no tiene visibilidad ni control sobre el pago del servicio.",
      PAGE.mx,
      doc.y,
      { width: CONTENT_W, align: "center" }
    );

  // ===== PAGINA 2 =====
  nuevaPagina(doc, "Documento Tecnico de Arquitectura", "Logica del Wallet");

  tituloSec(doc, "3. Logica del Wallet (creditos de uso)");
  parrafo(
    doc,
    "El wallet es una entidad de software interna a la plataforma Fixgo. NO es una cuenta bancaria, NO es un instrumento financiero y NO almacena dinero. Almacena unicamente un saldo de 'creditos de uso del software', los cuales son consumidos cuando el prestador acepta y completa servicios via la app."
  );

  tituloSec(doc, "3.1 Modelo de datos del wallet (PostgreSQL)");
  codeBlock(doc, [
    "TABLE wallets (",
    "  id              UUID PRIMARY KEY,",
    "  user_id         UUID NOT NULL REFERENCES users(id),",
    "  balance_credits  INTEGER NOT NULL DEFAULT 0,  -- creditos de uso",
    "  reserved_credits INTEGER NOT NULL DEFAULT 0,  -- bloqueados por trabajos en curso",
    "  created_at      TIMESTAMP NOT NULL DEFAULT now(),",
    "  updated_at      TIMESTAMP NOT NULL DEFAULT now()",
    ");",
  ]);

  parrafo(doc, "Cada movimiento del wallet queda registrado en una tabla de log inmutable:");
  codeBlock(doc, [
    "TABLE wallet_transactions (",
    "  id            UUID PRIMARY KEY,",
    "  wallet_id     UUID NOT NULL REFERENCES wallets(id),",
    "  type          VARCHAR NOT NULL, -- RECARGA | RESERVA | DESCUENTO | LIBERACION",
    "  amount        INTEGER NOT NULL, -- positivo o negativo",
    "  balance_after INTEGER NOT NULL,",
    "  service_id    UUID,             -- trabajo asociado (si aplica)",
    "  payment_ref   VARCHAR,          -- ID de pasarela (si es RECARGA)",
    "  invoice_ref   VARCHAR,          -- folio factura SII",
    "  hash_prev     VARCHAR(64),      -- hash de la transaccion anterior",
    "  hash_curr     VARCHAR(64),      -- SHA256 de esta transaccion",
    "  created_at    TIMESTAMP NOT NULL DEFAULT now()",
    ");",
  ]);

  tituloSec(doc, "3.2 Reglas de negocio del wallet");
  bullet(doc, "Los creditos solo se generan via RECARGA confirmada por la pasarela mediante webhook firmado.");
  bullet(doc, "Los creditos solo se descuentan al cierre de un servicio efectivamente completado.");
  bullet(doc, "Los creditos NO se pueden retirar ni convertir en dinero (clausula expresa en Terminos y Condiciones).");
  bullet(doc, "Cada transaccion incluye hash encadenado (estilo blockchain ligero) para garantizar inmutabilidad.");
  bullet(doc, "Cada RECARGA dispara la emision automatica de factura electronica via API del SII.");

  // ===== PAGINA 3 =====
  nuevaPagina(doc, "Documento Tecnico de Arquitectura", "Trazabilidad y SII");

  tituloSec(doc, "4. Trazabilidad de cada movimiento");
  parrafo(
    doc,
    "Todo movimiento de creditos en el wallet de un prestador queda registrado de forma permanente en la base de datos PostgreSQL, en la tabla wallet_transactions. Cada registro contiene los datos suficientes para que Fixgo pueda justificar ante el Servicio de Impuestos Internos (SII) el origen de cada credito y el motivo de cada descuento."
  );

  tituloSec(doc, "4.1 Datos auditables por transaccion");
  bullet(doc, "Identificador unico de la transaccion (UUID).");
  bullet(doc, "Identificador del wallet y del prestador (RUT).");
  bullet(doc, "Tipo de movimiento: RECARGA, RESERVA, DESCUENTO o LIBERACION.");
  bullet(doc, "Monto en creditos y saldo resultante.");
  bullet(doc, "Identificador del servicio asociado (en caso de descuento).");
  bullet(doc, "Identificador del pago en la pasarela (en caso de recarga).");
  bullet(doc, "Folio de factura electronica emitida (en caso de recarga).");
  bullet(doc, "Hash SHA-256 encadenado con la transaccion anterior (garantia de integridad).");
  bullet(doc, "Timestamp en UTC con zona horaria.");

  tituloSec(doc, "4.2 Reportes disponibles para fiscalizacion");
  bullet(doc, "Reporte mensual de RECARGAS por prestador, con folio de factura asociado.");
  bullet(doc, "Reporte de conciliacion entre depositos en cuenta corriente y RECARGAS registradas.");
  bullet(doc, "Reporte de descuentos de comision por servicio completado.");
  bullet(doc, "Exportacion en formato CSV / XML para presentacion al SII.");

  tituloSec(doc, "5. Justificacion fiscal");
  parrafo(
    doc,
    "Para cada peso que entra a la cuenta corriente de Servicios Tecnologicos Fixgo SpA, existe en el sistema una transaccion tipo RECARGA con: (1) referencia al pago confirmado por la pasarela, (2) referencia al folio de factura electronica emitida al prestador, (3) RUT del prestador receptor de los creditos. Esta trazabilidad 1 a 1 entre deposito bancario y factura emitida permite auditar la totalidad de los ingresos sin ambiguedades."
  );

  tituloSec(doc, "6. Stack tecnologico");
  bullet(doc, "Frontend movil: React 19 + TypeScript + Capacitor (Android e iOS).");
  bullet(doc, "Backend: Node.js + Express + TypeScript.");
  bullet(doc, "Base de datos: PostgreSQL con Drizzle ORM (transacciones ACID).");
  bullet(doc, "Hosting: Railway (region us-east).");
  bullet(doc, "Pasarelas: Webpay Plus (Transbank), Mercado Pago, Flow.");
  bullet(doc, "Facturacion electronica: integracion API con proveedor autorizado SII.");
  bullet(doc, "Notificaciones: Firebase Cloud Messaging.");
  bullet(doc, "Logs centralizados con rotacion y retencion minima de 5 anos (cumplimiento SII).");

  tituloSec(doc, "7. Conclusion tecnica");
  parrafo(
    doc,
    "La arquitectura del sistema Fixgo separa fisica y logicamente el flujo de fondos SaaS (que pasa por la cuenta de la empresa) del flujo de pagos por servicios (que ocurre directamente entre cliente y prestador, fuera de la plataforma). El modelo de wallet con log inmutable y hash encadenado permite trazabilidad completa de cada movimiento, lo cual sustenta la posicion ante el SII de que Fixgo es exclusivamente una empresa de tecnologia y no un agente recaudador por cuenta de terceros."
  );

  firmas(
    doc,
    {
      nombre: "Manuel Alex Lezcano Perez",
      cargo: "Lider Tecnico / Programador",
      empresa: "Servicios Tecnologicos Fixgo SpA",
      firma: FIRMA_ALEX,
    },
    {
      nombre: "Jonathan Sonny Cortez Laveriano",
      cargo: "Representante Legal",
      empresa: "Servicios Tecnologicos Fixgo SpA",
      firma: FIRMA_JONATHAN,
    },
    { titulo: "Documento Tecnico de Arquitectura", subtitulo: "Firmas" }
  );

  pintarFooters(doc);
  doc.end();
}

// Post-procesa: elimina paginas con texto vacio (auto-page-break de pdfkit)
async function limpiarPaginasVacias(filePath) {
  // Extraer texto pagina a pagina con pdftotext
  let textoPorPagina = [];
  try {
    const tmpDir = path.join("/tmp", "fixgo-pdf-clean");
    fs.mkdirSync(tmpDir, { recursive: true });
    const baseName = path.basename(filePath, ".pdf");
    // pdftotext separa por pagina con form-feed (\f)
    const txt = execSync(`pdftotext "${filePath}" -`, { encoding: "utf8" });
    textoPorPagina = txt.split("\f");
  } catch (e) {
    console.warn("No se pudo extraer texto, omito limpieza:", e.message);
    return;
  }

  // Cada pagina valida tiene "FIXGO" (header) o titulo seccion
  const paginasValidas = [];
  textoPorPagina.forEach((t, idx) => {
    const limpio = t.trim();
    // pagina valida: contiene "FIXGO" como header (no solo en footer "Servicios Tecnologicos Fixgo SpA")
    // estrategia simple: contar lineas no vacias significativas
    const lineas = limpio.split("\n").map((l) => l.trim()).filter((l) => l.length > 5);
    const tieneHeader = limpio.includes("FIXGO\n") || /FIXGO\s/.test(limpio.slice(0, 30));
    if (lineas.length >= 4 && tieneHeader) {
      paginasValidas.push(idx);
    }
  });

  if (paginasValidas.length === 0 || paginasValidas.length === textoPorPagina.length) {
    return; // nada que limpiar
  }

  // Reescribir PDF con solo paginas validas
  const buf = fs.readFileSync(filePath);
  const src = await PDFLibDocument.load(buf);
  const dst = await PDFLibDocument.create();
  const copiadas = await dst.copyPages(src, paginasValidas);
  copiadas.forEach((p) => dst.addPage(p));
  const bytes = await dst.save();
  fs.writeFileSync(filePath, bytes);
  console.log(
    `  ${path.basename(filePath)}: ${textoPorPagina.length} -> ${paginasValidas.length} paginas`
  );
}

async function main() {
  generarFlujoOperaciones();
  generarDocumentoTecnico();
  // pdfkit escribe asincronicamente, esperar a que termine de escribir los archivos
  await new Promise((r) => setTimeout(r, 500));
  console.log("Limpieza de paginas vacias:");
  await limpiarPaginasVacias(path.join(OUT_DIR, "01_Flujo_Operaciones_y_Fondos_FIXGO.pdf"));
  await limpiarPaginasVacias(path.join(OUT_DIR, "02_Documento_Tecnico_Arquitectura_FIXGO.pdf"));
  console.log("OK -> documentos generados en", OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
