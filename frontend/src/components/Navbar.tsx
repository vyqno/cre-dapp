"use client";

import Link from "next/link";
import { ConnectButton } from "thirdweb/react";
import { client } from "@/lib/thirdweb";

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-bold text-white">
            AgentIndex
          </Link>
          <div className="hidden items-center gap-6 md:flex">
            <Link
              href="/"
              className="text-sm text-zinc-400 transition-colors hover:text-white"
            >
              Leaderboard
            </Link>
            <Link
              href="/portfolio"
              className="text-sm text-zinc-400 transition-colors hover:text-white"
            >
              Portfolio
            </Link>
          </div>
        </div>
        <ConnectButton client={client} />
      </div>
    </nav>
  );
}
