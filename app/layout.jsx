import "./globals.css";

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
