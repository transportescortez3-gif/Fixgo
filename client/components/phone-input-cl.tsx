import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PhoneInputCLProps {
  value?: string | null;
  onChange: (value: string) => void;
  onBlur?: () => void;
  id?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const PREFIX = "+56";

export const PhoneInputCL = React.forwardRef<HTMLInputElement, PhoneInputCLProps>(
  ({ value, onChange, onBlur, id, placeholder = "9 1234 5678", className, disabled }, ref) => {
    const full = value ?? "";
    const local = full.startsWith(PREFIX) ? full.slice(PREFIX.length) : full.replace(/^\+?56/, "");

    return (
      <div className={cn("flex", className)}>
        <div
          className="flex items-center gap-1.5 px-3 rounded-l-md border border-r-0 border-input bg-muted/40 text-sm font-medium select-none"
          aria-label="Código país Chile"
        >
          <span className="text-base leading-none" aria-hidden>🇨🇱</span>
          <span className="text-foreground">{PREFIX}</span>
        </div>
        <Input
          ref={ref}
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder={placeholder}
          value={local}
          disabled={disabled}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
            onChange(digits ? `${PREFIX}${digits}` : "");
          }}
          onBlur={onBlur}
          className="rounded-l-none flex-1"
        />
      </div>
    );
  }
);
PhoneInputCL.displayName = "PhoneInputCL";
