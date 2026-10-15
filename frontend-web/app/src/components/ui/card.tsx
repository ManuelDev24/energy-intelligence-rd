import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const cardVariants = cva("rounded-lg border border-border bg-background", {
  variants: {
    // compact: listas y paneles densos · default: tarjeta estándar (16 px) · roomy: contenido destacado o solitario.
    density: { compact: "p-3", default: "p-4", roomy: "p-6" },
  },
  defaultVariants: { density: "default" },
});

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export function Card({ className, density, ...props }: CardProps) {
  return <div className={cn(cardVariants({ density }), className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-sm text-muted-foreground", className)} {...props} />;
}
