import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fixxer.app',
  appName: 'Fixgo',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    KeepAwake: {},
    Geolocation: {
      permissions: ['location'],
    },
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0F172A',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#0F172A',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'body',
      // resizeOnFullScreen eliminado: solo aplica a apps fullscreen (aquí
      // StatusBar.overlaysWebView=false). Activarlo sin fullscreen provoca el
      // bug conocido de Capacitor donde el WebView queda desplazado hacia
      // abajo tras cerrar el teclado (franja azul arriba, vista cortada abajo
      // y scroll que no alcanza el final).
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
