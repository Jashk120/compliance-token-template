"use client";

import { shortAddress } from "~~/utils/compliance/format";

export type StepState = "done" | "current" | "locked" | "in-progress";

export type GuideStep = {
  title: string;
  hint: string;
  state: StepState;
};

export function TxLink({ txId }: { txId: string }) {
  const href = `https://hashscan.io/testnet/transaction/${encodeURIComponent(txId)}`;
  return (
    <a className="link link-primary font-mono" href={href} target="_blank" rel="noreferrer" title={txId}>
      {shortAddress(txId)}
    </a>
  );
}

export function StepStateBadge({ state }: { state: StepState }) {
  if (state === "done") {
    return <span className="badge badge-success badge-sm">✓ Done</span>;
  }
  if (state === "in-progress") {
    return (
      <span className="badge badge-primary badge-sm">
        <span className="loading loading-spinner loading-xs" />
        Working…
      </span>
    );
  }
  if (state === "current") {
    return <span className="badge badge-primary badge-outline badge-sm">Current step</span>;
  }
  return <span className="badge badge-ghost badge-sm">Locked</span>;
}

export function InvestorSteps({ steps }: { steps: GuideStep[] }) {
  return (
    <ol className="steps steps-vertical w-full sm:steps-horizontal" aria-label="Investment steps">
      {steps.map((step, index) => {
        const isActive = step.state === "done" || step.state === "current" || step.state === "in-progress";
        return (
          <li
            key={step.title}
            className={isActive ? "step step-primary" : "step"}
            data-content={step.state === "done" ? "✓" : undefined}
            aria-current={step.state === "current" || step.state === "in-progress" ? "step" : undefined}
          >
            <span className="flex flex-col items-center gap-0.5 text-center">
              <span className="text-sm font-medium">
                {index + 1}. {step.title}
              </span>
              <span className="text-base-content/60 text-xs">{step.hint}</span>
              {step.state === "in-progress" ? (
                <span
                  className="loading loading-spinner loading-xs"
                  role="status"
                  aria-label={`${step.title} in progress`}
                />
              ) : null}
              <span className="sr-only">({step.state})</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
