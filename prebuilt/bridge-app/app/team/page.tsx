import type { Metadata } from "next";
import { TeamOnboarding } from "@/components/team/TeamOnboarding";

export const metadata: Metadata = {
  title: "Team setup | Bridge",
  description: "Configure a Bridge workspace and its GitHub App installation.",
};

export default function TeamPage() {
  return <TeamOnboarding />;
}
