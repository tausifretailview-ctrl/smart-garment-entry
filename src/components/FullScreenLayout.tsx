import { ReactNode } from "react";
import { Header } from "@/components/Header";

interface FullScreenLayoutProps {
  children: ReactNode;
}

export const FullScreenLayout = ({ children }: FullScreenLayoutProps) => {
  return (
    <div className="flex flex-col min-h-screen w-full bg-background">
      <Header />
      <main className="flex-1 animate-fade-in p-4">{children}</main>
    </div>
  );
};
