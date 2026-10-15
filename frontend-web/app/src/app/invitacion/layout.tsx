import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Invitación a una vivienda", robots: { index: false } };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
