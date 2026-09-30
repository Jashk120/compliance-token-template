import { InvestorClient } from "./_components/InvestorClient";
import { MissingConfig } from "~~/components/compliance/MissingConfig";
import { getPublicConfig } from "~~/services/compliance/config";

export const dynamic = "force-dynamic";

export default function InvestorPage() {
  const config = getPublicConfig();
  if (!config.configured) {
    return (
      <MissingConfig
        missing={config.missing}
        context="The investor flow needs the compliance token, sale, issuer and operator configuration."
      />
    );
  }
  return <InvestorClient config={config} />;
}
