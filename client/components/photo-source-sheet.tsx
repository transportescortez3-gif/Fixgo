import { Camera, Images } from "lucide-react";

interface PhotoSourceSheetProps {
  open: boolean;
  onClose: () => void;
  onCamera: () => void;
  onGallery: () => void;
}

export function PhotoSourceSheet({ open, onClose, onCamera, onGallery }: PhotoSourceSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full bg-background rounded-t-2xl px-4 pt-5 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-5" />
        <p className="text-center font-semibold text-base mb-5">Seleccionar una acción</p>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => {
              onClose();
              onCamera();
            }}
            className="flex flex-col items-center gap-3 py-6 px-4 bg-muted/50 hover:bg-muted rounded-2xl transition-colors border border-border/50 active:scale-95"
          >
            <div className="w-14 h-14 rounded-full bg-background flex items-center justify-center border border-border shadow-sm">
              <Camera className="w-7 h-7 text-foreground" />
            </div>
            <span className="text-sm font-medium">Cámara</span>
          </button>

          <button
            onClick={() => {
              onClose();
              onGallery();
            }}
            className="flex flex-col items-center gap-3 py-6 px-4 bg-muted/50 hover:bg-muted rounded-2xl transition-colors border border-border/50 active:scale-95"
          >
            <div className="w-14 h-14 rounded-full bg-background flex items-center justify-center border border-border shadow-sm">
              <Images className="w-7 h-7 text-foreground" />
            </div>
            <span className="text-sm font-medium">Fotos y videos</span>
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 py-3 text-sm text-muted-foreground font-medium hover:bg-muted rounded-xl transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
