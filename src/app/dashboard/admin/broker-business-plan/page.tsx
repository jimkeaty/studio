// src/app/dashboard/admin/broker-business-plan/page.tsx
import { Metadata } from "next";
import { BrokerBusinessPlanInner } from "@/components/dashboard/broker/BrokerBusinessPlanInner";

export const metadata: Metadata = {
  title: "Broker Business Plan | Keaty Real Estate",
  description: "Annual broker & recruiting business plan with cascade calculator and monthly goal distribution.",
};

export default function BrokerBusinessPlanPage() {
  return (
    <div className="container max-w-5xl mx-auto px-4 py-6">
      <BrokerBusinessPlanInner />
    </div>
  );
}
