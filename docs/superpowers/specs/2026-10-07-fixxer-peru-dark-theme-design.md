# Diseño: tema oscuro global para Fixxer Expertos en Perú

## Estado

El usuario aprobó activar la paleta oscura existente como tema predeterminado de Fixxer Expertos en Perú y aprobó la especificación escrita. La implementación y las verificaciones web están completas. La marca visible vigente es Fixxer Expertos; `fixxer-peru` se conserva como identificador técnico.

## Contexto y objetivo

La portada y las pantallas internas se muestran actualmente con la paleta clara. `src/index.css` ya define una paleta `.dark` (fondo azul marino, tarjetas más claras, texto claro y acento celeste), pero el documento HTML no activa esa clase y `useTheme()` no aplica ningún tema.

El objetivo es que Fixxer Expertos use la paleta oscura de forma consistente en web, Android e iOS, conservando los flujos y la identidad celeste de la marca.

## Decisiones aprobadas

- Aplicar el tema oscuro a toda la aplicación, incluidas las pantallas internas.
- Activar la clase `.dark` existente desde el primer render, reutilizando los tokens CSS actuales.
- Mantener la paleta azul/celeste de Fixxer Expertos y ajustar solo las superficies y textos explícitamente claros que perjudiquen el contraste.
- Mantener blancos intencionales en controles, iconos, imágenes, capturas de firma u otros elementos donde sean semánticos y legibles.
- No modificar Fixgo.

## Diseño de implementación

1. Marcar el documento raíz como oscuro antes de iniciar React para que las variables `.dark` y las variantes `dark:` se apliquen en todas las rutas sin destello claro.
2. Revisar las clases de fondo y texto fijadas explícitamente a blanco o negro. Cambiar los paneles de interfaz incompatibles a tokens semánticos existentes (`bg-background`, `bg-card`, `text-foreground` y equivalentes). Conservar excepciones deliberadas como estados, controles sobre imágenes y superficies de firma.
3. Mantener sin cambios las rutas, los datos, la autenticación, las reglas de negocio, los textos peruanos, las llamadas y los flujos nativos. La misma página web integrada por Capacitor hereda el tema en Android e iOS.

No se añadirá un selector claro/oscuro en este alcance: el tema oscuro será el predeterminado solicitado.

## Pruebas y criterios de aceptación

- Typecheck y build web de Fixxer Expertos completan correctamente.
- La portada pública se ve oscura y conserva el acento celeste y la legibilidad.
- Revisar las superficies compartidas de navegación y las pantallas internas afectadas; no deben quedar paneles grandes con fondo blanco ni texto negro ilegible.
- Las excepciones intencionalmente claras conservan contraste suficiente.
- No se toca el artefacto, los estilos ni las configuraciones de Fixgo.
- No se habilitan nuevas funciones, datos ni comportamiento de tema.

## Fuera de alcance

- Cambiar la paleta de marca, logotipos, tipografía, contenido o composición.
- Agregar un control para alternar entre tema claro y oscuro.
- Cambios a API, base de datos, pagos, KYC, contenido legal o configuración de producción.
