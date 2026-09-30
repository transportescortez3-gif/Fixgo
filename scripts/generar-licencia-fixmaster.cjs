// Genera Licencia_Uso_Fixgo.pdf con la marca legal vigente.
const PDFDocument = require("pdfkit");
const fs = require("fs");

const out = "attached_assets/Licencia_Uso_Fixgo.pdf";
const doc = new PDFDocument({ size: "LETTER", margins: { top: 64, bottom: 64, left: 72, right: 72 } });
doc.pipe(fs.createWriteStream(out));

const H = (t) => { doc.moveDown(0.8); doc.font("Helvetica-Bold").fontSize(12).text(t); doc.moveDown(0.3); doc.font("Helvetica").fontSize(11); };
const P = (t, opts = {}) => { doc.font("Helvetica").fontSize(11).text(t, { align: "justify", ...opts }); doc.moveDown(0.4); };
const LI = (t) => { doc.font("Helvetica").fontSize(11).text("•  " + t, { indent: 16, align: "justify" }); doc.moveDown(0.2); };
const LT = (l, t) => { doc.font("Helvetica").fontSize(11).text(l + ". " + t, { indent: 16, align: "justify" }); doc.moveDown(0.2); };

doc.font("Helvetica-Bold").fontSize(15).text("LICENCIA DE USO DE SOFTWARE PROPIETARIO", { align: "center" });
doc.moveDown(0.5);
doc.font("Helvetica-Bold").fontSize(12).text("FIXGO — Plataforma web y aplicaciones móviles", { align: "center" });
doc.moveDown(0.3);
doc.font("Helvetica").fontSize(11).text("Fecha de emisión: 6 de abril de 2026", { align: "center" });
doc.moveDown(1);

H("1. TITULARIDAD Y AUTORÍA");
P("El software denominado “FIXGO”, incluyendo pero no limitado a: su código fuente, código objeto, arquitectura, bases de datos, diseños de interfaz, elementos gráficos, logotipos, textos, algoritmos, documentación técnica y toda obra derivada de los anteriores (en adelante, “el Software”), es una obra original de autoría exclusiva de:");
P("JONATHAN SONNY CORTEZ LAVERIANO\nRUT: 23.339.727-K\nDomicilio: Santiago Concha 1520, Santiago, Región Metropolitana, Chile\nCorreo electrónico: fixxer.sap@gmail.com");
P("(en adelante, “el Titular”).");
P("El Titular es el único y exclusivo propietario de todos los derechos patrimoniales y morales de autor sobre el Software, conforme a la Ley N° 17.336 sobre Propiedad Intelectual de la República de Chile y los tratados internacionales aplicables (Convenio de Berna, ADPIC).");

H("2. NATURALEZA DE LA LICENCIA");
P("El Software se distribuye bajo una licencia propietaria, privada y de uso restringido. El Software NO es software libre ni de código abierto (open source). Todos los derechos que no se conceden expresamente en este documento quedan reservados al Titular.");

H("3. ALCANCE DEL USO PERMITIDO");
P("El acceso y uso del Software se concede únicamente a los usuarios finales registrados en la plataforma FIXGO (sitio web y aplicaciones móviles oficiales), de forma:");
LI("Personal e intransferible: la cuenta de usuario es individual y no puede cederse;");
LI("No exclusiva: el Titular puede otorgar acceso a cualquier número de usuarios;");
LI("Revocable: el Titular puede suspender o terminar el acceso ante incumplimiento de los Términos y Condiciones de la plataforma;");
LI("Limitada: el uso se restringe a las funcionalidades ofrecidas por la plataforma a través de sus interfaces oficiales.");
doc.moveDown(0.2);
P("El uso del Software por los usuarios finales se rige, además, por los Términos y Condiciones publicados dentro de la propia plataforma, que forman parte integrante de esta licencia.");

H("4. PROHIBICIONES EXPRESAS");
P("Queda estrictamente prohibido, sin autorización previa, expresa y por escrito del Titular:");
LT("a", "Copiar, reproducir o duplicar el Software, total o parcialmente, por cualquier medio;");
LT("b", "Modificar, adaptar, traducir o crear obras derivadas del Software;");
LT("c", "Realizar ingeniería inversa, descompilar, desensamblar o intentar derivar el código fuente;");
LT("d", "Distribuir, publicar, sublicenciar, arrendar, prestar o vender el Software o el acceso a él;");
LT("e", "Utilizar el Software o partes de él para desarrollar productos o servicios competidores;");
LT("f", "Eliminar, alterar u ocultar avisos de derechos de autor, marcas o leyendas de propiedad;");
LT("g", "Acceder al Software por medios distintos a las interfaces oficiales (web y apps publicadas);");
LT("h", "Utilizar técnicas de extracción masiva de datos (scraping, crawling) sobre la plataforma;");
LT("i", "Transferir a terceros cualquiera de los derechos limitados que se conceden en este documento.");

H("5. RESERVA DE DERECHOS");
P("Este documento no constituye una venta del Software ni de ninguno de sus componentes. El Titular conserva la propiedad plena y todos los derechos sobre el Software, sus copias, mejoras, actualizaciones y obras derivadas, cualquiera sea el soporte en que se encuentren.");
P("Las marcas, nombres comerciales, logotipos y signos distintivos asociados a FIXGO son propiedad del Titular y no se concede licencia alguna sobre ellos.");

H("6. COMPONENTES DE TERCEROS");
P("El Software utiliza librerías y componentes de terceros bajo sus respectivas licencias (open source u otras), las cuales se respetan y mantienen independientes. La incorporación de dichos componentes no afecta la titularidad del Titular sobre el código original de su autoría, ni convierte al Software en obra de código abierto.");

H("7. GARANTÍAS Y RESPONSABILIDAD");
P("El Software se proporciona “tal cual” (as is). En la máxima medida permitida por la ley, el Titular no garantiza que el Software esté libre de errores o interrupciones, y no será responsable por daños indirectos derivados del uso o imposibilidad de uso del Software, sin perjuicio de los derechos irrenunciables que la ley otorga a los consumidores.");

H("8. VIGENCIA Y TERMINACIÓN");
P("Esta licencia rige desde la fecha de su emisión y permanecerá vigente mientras el Titular mantenga la explotación del Software. El incumplimiento de cualquiera de sus cláusulas por parte de un usuario producirá la terminación inmediata y automática de su derecho de uso, sin necesidad de declaración judicial, y facultará al Titular para bloquear la cuenta respectiva y ejercer las acciones legales que correspondan.");

H("9. LEY APLICABLE Y JURISDICCIÓN");
P("Esta licencia se rige por las leyes de la República de Chile, en particular la Ley N° 17.336 sobre Propiedad Intelectual. Cualquier controversia derivada de este documento será sometida a los tribunales ordinarios de justicia de la ciudad de Santiago, Chile.");

doc.moveDown(1);
P("© 2026 JONATHAN SONNY CORTEZ LAVERIANO. Todos los derechos reservados.");
doc.moveDown(2);
doc.font("Helvetica").fontSize(11).text("Firma del Titular:");
doc.moveDown(3);
doc.text("_________________________________");
doc.moveDown(0.3);
doc.font("Helvetica-Bold").text("JONATHAN SONNY CORTEZ LAVERIANO");
doc.font("Helvetica").text("RUT: 23.339.727-K");
doc.text("Titular de los derechos — Fundador de Fixgo (Fixgo SpA, en formación)");

doc.end();
doc.on("end", () => console.log("OK " + out));
