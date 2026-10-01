import HomeClient from "./HomeClient";
import { config } from "@/lib/config";

// Server wrapper so marketing copy reflects the real server-side settings.
export default function HomePage() {
  return <HomeClient freeLimit={config.freeReviewLimit} remindersProOnly={config.remindersProOnly} teamsEnabled={config.teamsEnabled} />;
}
