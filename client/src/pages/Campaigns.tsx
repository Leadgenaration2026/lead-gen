import { CampaignsList } from "@/components/CampaignsList";

// Shows only the 5 most recent campaigns -- see AllCampaigns.tsx for the
// full, uncapped list (linked from here once there are more than 5).
export default function CampaignsPage() {
  return <CampaignsList limit={5} />;
}
