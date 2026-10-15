import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// Altura: 36 px con puntero fino y 44 px en táctil (`pointer-coarse`). `sm` queda en 32 px para tablas y filtros.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:opacity-90 active:opacity-80",
        outline: "border border-border bg-background hover:bg-muted active:bg-muted",
        tertiary: "text-primary hover:bg-muted active:bg-muted",
        danger: "bg-danger text-white hover:opacity-90 active:opacity-80",
      },
      size: {
        md: "h-9 px-4 pointer-coarse:h-11",
        sm: "h-8 px-3 pointer-coarse:h-10",
        icon: "h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Estado de carga: deshabilita el botón y lo anuncia como ocupado. El texto lo decide quien llama. */
  loading?: boolean;
}

export function Button({ className, variant, size, loading, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      {...props}
    />
  );
}

export { buttonVariants };
