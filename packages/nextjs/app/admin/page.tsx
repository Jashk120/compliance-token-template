import { AdminClient } from "./_components/AdminClient";
import { MissingConfig } from "~~/components/compliance/MissingConfig";
import { getPublicConfig } from "~~/services/compliance/config";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  const config = getPublicConfig();
  if (!config.configured) {
    return (
      <MissingConfig
        missing={config.missing}
        context="The compliance officer console needs the token, sale, issuer, operator and audit configuration."
      />
    );
  }
  return <AdminClient config={config} />;
}
