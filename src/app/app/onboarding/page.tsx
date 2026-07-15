import type { Metadata } from "next";
import { OnboardingScreen } from "@/components/screens/OnboardingScreen";

export const metadata: Metadata = { title: "Corpus — Empezar · las dos puertas" };

// Las dos puertas al master. Ver docs/spec/pantallas/onboarding.md.
export default function OnboardingPage() {
  return <OnboardingScreen />;
}
