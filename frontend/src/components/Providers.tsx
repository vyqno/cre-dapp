"use client";

import { ThirdwebProvider } from "thirdweb/react";
import { Toaster } from "react-hot-toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThirdwebProvider>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#18181b",
            color: "#e4e4e7",
            border: "1px solid #27272a",
            fontSize: "14px",
          },
          success: {
            iconTheme: { primary: "#34d399", secondary: "#18181b" },
          },
          error: {
            iconTheme: { primary: "#f87171", secondary: "#18181b" },
          },
        }}
      />
    </ThirdwebProvider>
  );
}
