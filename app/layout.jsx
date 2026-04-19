import "./globals.css";
import { startDailyStatsWorker } from "../src/server/daily-stats-worker";

if (!process.argv.includes("build")) {
  startDailyStatsWorker();
}

export const metadata = {
  title: "IPL Player Intelligence",
  description: "All IPL players and stats from your database",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
