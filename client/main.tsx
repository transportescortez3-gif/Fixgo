import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { setBaseUrl } from "./api/custom-fetch";
import App from "./App";
import "./index.css";
import { migrateBrandStorage } from "./lib/brand-storage";
import { APP_URL } from "./lib/app-config";

migrateBrandStorage();

if (Capacitor.isNativePlatform()) {
  const PROD_BASE = APP_URL;

  setBaseUrl(PROD_BASE);

  const _nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/")) {
      return _nativeFetch(PROD_BASE + input, init);
    }
    if (input instanceof Request && input.url.startsWith("/")) {
      return _nativeFetch(new Request(PROD_BASE + input.url, input), init);
    }
    return _nativeFetch(input, init);
  };

  // Las etiquetas <img> cargan recursos directamente, sin pasar por fetch. En la
  // app nativa el webview corre en https://localhost, por lo que un src relativo
  // como /api/storage/objects/... nunca llega al servidor y la imagen se ve rota.
  // React asigna el src vía setAttribute, así que lo interceptamos ahí y le
  // anteponemos el servidor de producción a las rutas /api/ de imágenes.
  const _origSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name: string, value: string) {
    if (
      name === "src" &&
      typeof value === "string" &&
      value.startsWith("/api/") &&
      (this instanceof HTMLImageElement || this instanceof HTMLSourceElement)
    ) {
      return _origSetAttribute.call(this, name, PROD_BASE + value);
    }
    return _origSetAttribute.call(this, name, value);
  };

  // React 19 y Radix (AvatarImage) asignan el src vía la PROPIEDAD `src`, y
  // `new Image()` (usado para precargar) también. Eso NO pasa por setAttribute,
  // así que las imágenes quedaban "colgadas" en nativo. Parcheamos el descriptor
  // de la propiedad `src` para anteponer el servidor de producción a las rutas /api/.
  const _imgSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  if (_imgSrcDescriptor?.get && _imgSrcDescriptor?.set) {
    const _origGet = _imgSrcDescriptor.get;
    const _origSet = _imgSrcDescriptor.set;
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      configurable: true,
      enumerable: _imgSrcDescriptor.enumerable,
      get() {
        return _origGet.call(this);
      },
      set(value: string) {
        if (typeof value === "string" && value.startsWith("/api/")) {
          _origSet.call(this, PROD_BASE + value);
        } else {
          _origSet.call(this, value);
        }
      },
    });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
