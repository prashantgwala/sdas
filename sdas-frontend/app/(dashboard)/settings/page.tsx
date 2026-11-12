import type { Metadata } from "next";
import { SettingsForm } from "@/components/account/settings-form";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <SettingsForm />;
}
