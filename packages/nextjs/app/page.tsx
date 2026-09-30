"use client";

import Image from "next/image";
import Link from "next/link";
import { HederaPortalFaucet } from "@scaffold-hbar-ui/components";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import {
  ClipboardDocumentListIcon,
  CurrencyDollarIcon,
  IdentificationIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { HederaAddress } from "~~/components/scaffold-hbar";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";

const FEATURES = [
  {
    icon: ShieldCheckIcon,
    title: "HTS compliance controls",
    body: "An HTS fungible token whose KYC, freeze, supply, pause and admin keys are contractId keys bound to the contract itself. Role-gated grantKyc / revokeKyc / freeze / unfreeze / pause / unpause, plus a treasury sale hook.",
  },
  {
    icon: CurrencyDollarIcon,
    title: "Oracle-priced sale",
    body: "TokenSale reads a Chainlink HBAR/USD feed through a swappable IPriceFeed adapter, checks round freshness, prices each purchase live, enforces a per-investor USD cap and refunds rounding dust.",
  },
  {
    icon: IdentificationIcon,
    title: "Verifiable credentials",
    body: "A did:hedera issuer signs Ed25519 credentials. The API resolves the DID on-chain, verifies the signature, subject and validity window, then grants KYC on-chain.",
  },
  {
    icon: ClipboardDocumentListIcon,
    title: "HCS audit trail",
    body: "Every compliance action is written to a Hedera Consensus Service topic with the original transaction id and credential proof. The timeline reads it back from the Mirror Node.",
  },
] as const;

const PAGES = [
  {
    href: "/investor",
    icon: UserIcon,
    title: "Investor",
    body: "A guided associate → verify KYC → buy stepper that unlocks each step from live on-chain status.",
  },
  {
    href: "/admin",
    icon: ShieldCheckIcon,
    title: "Compliance officer",
    body: "Role-gated revoke-kyc, freeze / unfreeze and pause / unpause. Idempotent: no transaction when the state already matches.",
  },
  {
    href: "/audit",
    icon: ClipboardDocumentListIcon,
    title: "Audit log",
    body: "The Mirror-Node-backed HCS timeline: friendly action labels, HashScan links and the credential-proof hash.",
  },
] as const;

const FLOW = [
  { n: 1, title: "Associate the token", body: "The investor associates the HTS token with their account." },
  { n: 2, title: "Verify a credential", body: "The API resolves the issuer DID and verifies the signed credential." },
  { n: 3, title: "Grant KYC", body: "The operator grants KYC on-chain and publishes an HCS audit message." },
  {
    n: 4,
    title: "Buy priced by Chainlink",
    body: "HBAR converts to USD at the live feed rate and tokens transfer from the treasury.",
  },
] as const;

const Home: NextPage = () => {
  const { address: connectedAddress, status } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const blockExplorerUrl = targetNetwork.blockExplorers?.default?.url ?? "https://hashscan.io/testnet";

  const isReconnecting = status === "reconnecting" || status === "connecting";
  const isConnected = status === "connected" && connectedAddress;

  return (
    <>
      <div className="flex items-center flex-col grow">
        <div className="hedera-gradient dark:bg-none dark:bg-hedera-charcoal w-full py-16 px-5">
          <div className="flex flex-col items-center max-w-2xl mx-auto text-center">
            <Image
              src="/Hedera-Icon-White.svg"
              alt="Hedera icon"
              width={80}
              height={80}
              className="mb-6 hidden dark:block"
            />
            <Image src="/Hedera-Icon-Dark.svg" alt="Hedera icon" width={80} height={80} className="mb-6 dark:hidden" />
            <div className="flex flex-col items-center gap-1 mb-4">
              <span className="block text-lg font-medium tracking-widest uppercase text-white/80 dark:text-white/60">
                Built on Hedera
              </span>
              <span className="block text-lg font-medium tracking-widest uppercase text-white/80 dark:text-white/60">
                For
              </span>
              <Image
                src="/Hedera-Wordmark-Lockup-White.svg"
                alt="Hedera"
                width={240}
                height={48}
                className="mt-1 hidden dark:block"
              />
              <Image
                src="/Hedera-Wordmark-Lockup-Dark.svg"
                alt="Hedera"
                width={240}
                height={48}
                className="mt-1 dark:hidden"
              />
            </div>
            <h1 className="text-2xl font-bold text-white m-0">Compliance Token template</h1>
            <p className="text-white/80 text-sm m-0 mt-2 max-w-xl">
              A production-shaped template for regulated tokens on Hedera: HTS compliance controls, a Chainlink-priced
              sale, verifiable credentials and an auditable consensus log.
            </p>
          </div>
        </div>

        <div className="w-full max-w-4xl mx-auto px-5 -mt-8">
          <div className="bg-base-100 rounded-2xl shadow-lg p-8">
            {isReconnecting ? (
              <div className="flex flex-col items-center gap-2">
                <p className="font-semibold text-sm text-base-content/60 uppercase tracking-wider m-0">Connecting…</p>
                <div className="h-8 w-48 rounded bg-base-200 animate-pulse" aria-hidden />
              </div>
            ) : isConnected ? (
              <div className="flex flex-col items-center gap-2">
                <p className="font-semibold text-sm text-base-content/60 uppercase tracking-wider m-0">
                  Connected Address
                </p>
                <HederaAddress address={connectedAddress} chain={targetNetwork} />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <p className="font-semibold text-sm text-base-content/60 uppercase tracking-wider m-0">
                  Connect your wallet to get started
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="w-full max-w-4xl mx-auto px-5 mt-10">
          <h2 className="text-xl font-bold text-center mb-1">What this template demonstrates</h2>
          <p className="text-base-content/60 text-sm text-center mb-6">
            Four Hedera services composed into one load-bearing use case.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {FEATURES.map(feature => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="bg-base-100 rounded-2xl shadow-md p-6 border border-base-300 flex flex-col items-start"
                >
                  <div className="w-12 h-12 rounded-full hedera-gradient flex items-center justify-center mb-4">
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="font-bold text-base mb-2">{feature.title}</h3>
                  <p className="text-base-content/70 text-sm m-0">{feature.body}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="w-full max-w-4xl mx-auto px-5 mt-10">
          <h2 className="text-xl font-bold text-center mb-1">Explore the app</h2>
          <p className="text-base-content/60 text-sm text-center mb-6">
            Three purpose-built pages, plus HashScan for raw chain data.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {PAGES.map(page => {
              const Icon = page.icon;
              return (
                <Link
                  key={page.href}
                  href={page.href}
                  className="bg-base-100 rounded-2xl shadow-md p-6 border border-base-300 flex flex-col items-start hover:shadow-lg transition-shadow"
                >
                  <div className="w-12 h-12 rounded-full hedera-gradient flex items-center justify-center mb-4">
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="font-bold text-base mb-2">{page.title}</h3>
                  <p className="text-base-content/70 text-sm m-0">{page.body}</p>
                </Link>
              );
            })}
            <div className="bg-base-100 rounded-2xl shadow-md p-6 border border-base-300 flex flex-col items-start">
              <div className="w-12 h-12 rounded-full hedera-gradient flex items-center justify-center mb-4">
                <MagnifyingGlassIcon className="h-6 w-6 text-white" />
              </div>
              <h3 className="font-bold text-base mb-2">Block explorer</h3>
              <p className="text-base-content/70 text-sm m-0 mb-4">
                Every transaction, account and HCS message, on HashScan.
              </p>
              <a href={blockExplorerUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm mt-auto">
                Open HashScan
              </a>
            </div>
          </div>
        </div>

        <div className="w-full max-w-4xl mx-auto px-5 mt-10">
          <h2 className="text-xl font-bold text-center mb-1">How it works</h2>
          <p className="text-base-content/60 text-sm text-center mb-6">
            From a signed credential to a token purchase, all recorded on Hedera.
          </p>
          <div className="bg-base-100 rounded-2xl shadow-md p-6 border border-base-300">
            <ol className="grid grid-cols-1 md:grid-cols-4 gap-6 m-0 p-0 list-none">
              {FLOW.map(step => (
                <li key={step.n} className="flex flex-col items-start">
                  <span className="w-8 h-8 rounded-full bg-primary text-primary-content font-bold flex items-center justify-center mb-3">
                    {step.n}
                  </span>
                  <h3 className="font-semibold text-sm mb-1">{step.title}</h3>
                  <p className="text-base-content/70 text-xs m-0">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="w-full max-w-4xl mx-auto px-5 mt-10 pb-16">
          <div className="bg-base-100 rounded-2xl shadow-md p-8 border border-base-300">
            <h2 className="text-xl font-bold mb-2 text-center">Quick start</h2>
            <p className="text-base-content/70 text-sm text-center max-w-2xl mx-auto mb-6">
              One command from a terminal, then this app is running against your own testnet deployment.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="flex items-start gap-3">
                <span className="font-bold text-primary text-lg leading-none mt-0.5">1</span>
                <div>
                  <p className="m-0 font-medium">Configure credentials</p>
                  <div className="flex flex-col gap-1">
                    <code className="text-xs bg-base-200 px-2 py-1 rounded">yarn setup</code>
                    <code className="text-xs bg-base-200 px-2 py-1 rounded">yarn doctor</code>
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="font-bold text-primary text-lg leading-none mt-0.5">2</span>
                <div>
                  <p className="m-0 font-medium">Deploy to testnet</p>
                  <code className="text-xs bg-base-200 px-2 py-1 rounded">yarn deploy:testnet</code>
                  <p className="m-0 mt-1 text-base-content/60 text-xs">
                    Contracts, token, roles, audit topic, issuer DID.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="font-bold text-primary text-lg leading-none mt-0.5">3</span>
                <div>
                  <p className="m-0 font-medium">Run the app</p>
                  <code className="text-xs bg-base-200 px-2 py-1 rounded">yarn dev</code>
                  <p className="m-0 mt-1 text-base-content/60 text-xs">Then open /investor, /admin or /audit.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="font-bold text-primary text-lg leading-none mt-0.5">4</span>
                <div>
                  <p className="m-0 font-medium">Get testnet HBAR</p>
                  <HederaPortalFaucet variant="link" label="portal.hedera.com/faucet" showIcon={false} />
                </div>
              </div>
            </div>
            <p className="text-base-content/60 text-xs text-center mt-6">
              Contracts: <code>packages/hardhat/contracts/</code> · Frontend: <code>packages/nextjs/app/</code> · Docs:
              README + AGENTS.md
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default Home;
