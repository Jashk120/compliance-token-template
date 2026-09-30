"use client";

import { useMemo } from "react";
import { notification } from "~~/utils/scaffold-hbar";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
};

type Validity = "empty" | "valid" | "invalid";

export function CredentialInput({ value, onChange, disabled }: Props) {
  const validity: Validity = useMemo(() => {
    if (value.trim().length === 0) {
      return "empty";
    }
    try {
      JSON.parse(value);
      return "valid";
    } catch {
      return "invalid";
    }
  }, [value]);

  async function onPaste() {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      notification.error("Clipboard access is not available in this browser.");
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        notification.error("The clipboard is empty.");
        return;
      }
      onChange(text);
    } catch {
      notification.error("Could not read from the clipboard. Paste manually instead.");
    }
  }

  return (
    <div className="form-control gap-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="investor-credential" className="label-text font-medium">
          Signed credential
        </label>
        <button type="button" className="btn btn-ghost btn-xs" onClick={onPaste} disabled={disabled}>
          Paste
        </button>
      </div>
      <p id="investor-credential-helper" className="text-base-content/60 text-xs">
        Paste the signed credential JSON your issuer gave you.
      </p>
      <textarea
        id="investor-credential"
        className="textarea textarea-bordered h-44 w-full resize-y rounded-2xl p-3 font-mono text-xs leading-relaxed focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder='{ "subject": "0x...", "issuer": "did:hedera:...", ... }'
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        aria-describedby="investor-credential-helper investor-credential-status"
        aria-invalid={validity === "invalid"}
      />
      <p id="investor-credential-status" aria-live="polite" className="text-xs">
        {validity === "valid" ? (
          <span className="badge badge-success badge-sm">Valid JSON</span>
        ) : validity === "invalid" ? (
          <span className="badge badge-error badge-sm">Invalid JSON — check commas and quotes</span>
        ) : (
          <span className="text-base-content/50">Waiting for input…</span>
        )}
      </p>
    </div>
  );
}
