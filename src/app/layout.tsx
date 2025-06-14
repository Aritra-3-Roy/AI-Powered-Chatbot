import type { Metadata } from "next";
import { Poppins, Fira_Mono } from "next/font/google";
import "./globals.css";

// Use Poppins for a modern, interactive sans-serif and Fira Mono for code/mono
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const firaMono = Fira_Mono({
  variable: "--font-fira-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Chatbot",
  description: "A modern, interactive AI chatbot experience",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${poppins.variable} ${firaMono.variable} antialiased bg-background text-primary relative overflow-hidden`}
        style={{
          fontFamily: "var(--font-poppins), system-ui, sans-serif",
        }}
      >
        {/* Animated light background blobs */}
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute top-[-10%] left-[-10%] w-[400px] h-[400px] bg-blue-200 opacity-40 rounded-full blur-3xl animate-blob1" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-pink-200 opacity-40 rounded-full blur-3xl animate-blob2" />
          <div className="absolute top-[30%] left-[60%] w-[300px] h-[300px] bg-purple-200 opacity-30 rounded-full blur-2xl animate-blob3" />
        </div>
        {children}
      </body>
    </html>
  );
}