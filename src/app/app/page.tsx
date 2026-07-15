import type { Metadata } from "next";
import { DashboardScreen } from "@/components/screens/DashboardScreen";

export const metadata: Metadata = { title: "Corpus — Panel" };

export default function AppDashboardPage() {
  return <DashboardScreen />;
}
