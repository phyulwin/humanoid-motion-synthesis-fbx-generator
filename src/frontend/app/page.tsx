// File: kinetix-studio/frontend/app/page.tsx
// This file renders the main dashboard entry page.

import StudioDashboard from "@/components/studio-dashboard";

export default async function HomePage() {
  // This server component returns the dashboard shell without any authentication dependency.
  return <StudioDashboard />;
}
