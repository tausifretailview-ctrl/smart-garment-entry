import { ReactNode } from "react";
import { Header } from "@/components/Header";

interface POSLayoutProps {
  children: ReactNode;
}

export const POSLayout = ({ children }: POSLayoutProps) => {
  return (
    <div className="flex flex-col min-h-screen w-full bg-background">
      <Header />
      <main className="flex-1 animate-fade-in p-4">{children}</main>
    </div>
  );
};
