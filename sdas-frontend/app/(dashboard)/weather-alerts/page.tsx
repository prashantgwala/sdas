import type { Metadata } from "next";
import { WeatherAlertList } from "@/components/disaster/weather-alert-list";

export const metadata: Metadata = { title: "Weather alerts" };

export default function WeatherAlertsPage() {
  return <WeatherAlertList />;
}
