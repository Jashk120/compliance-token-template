import { AuditClient } from "./_components/AuditClient";
import { MissingConfig } from "~~/components/compliance/MissingConfig";
import { getPublicConfig } from "~~/services/compliance/config";

export const dynamic = "force-dynamic";

export default function AuditPage() {
  const config = getPublicConfig();
  if (!config.configured) {
    return (
      <MissingConfig
        missing={config.missing}
        context="The audit timeline needs the audit topic and the compliance configuration."
      />
    );
  }
  return <AuditClient />;
}
