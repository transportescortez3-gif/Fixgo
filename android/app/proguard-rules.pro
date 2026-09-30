# Reglas específicas de Fixgo para el release optimizado con R8.
#
# R8 ya recibe reglas consumer desde AndroidX, Firebase y Capacitor. No usar
# reglas globales que conserven toda la aplicación: si aparece un warning real,
# agregar aquí la regla mínima para esa API.

# Conserva metadatos usados por anotaciones, reflexión y serialización de
# dependencias Android.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Los puntos de entrada declarados en AndroidManifest.xml se conservan por el
# análisis del manifest de R8. Estas clases se mantienen explícitas porque
# también participan en intents y broadcasts enviados por FCM.
-keep public class com.fixxer.app.MainActivity { *; }
-keep public class com.fixxer.app.IncomingCallActivity { *; }
-keep public class com.fixxer.app.ServiceRequestAlertsPlugin { *; }
-keep public class com.fixxer.app.FixxerMessagingService { *; }

# Conserva información de líneas para diagnosticar errores del release
# ofuscado sin conservar nombres originales de clases y métodos.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# PushNotificationsPlugin consulta @CapacitorPlugin y @Permission mediante
# reflexión cuando requestPermissions/checkPermissions se ejecutan. Mantener
# explícitamente la clase y sus metadatos evita una metadata nula en releases
# optimizados con R8.
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault
-keep class com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin { *; }
