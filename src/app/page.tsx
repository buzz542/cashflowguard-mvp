import HomeClient from "./HomeClient";
import { config } from "@/lib/config";

// Server wrapper so marketing copy reflects the real server-side free allowance.
export default function HomePage() {
  return <HomeClient freeLimit={config.freeReviewLimit} />;
}
