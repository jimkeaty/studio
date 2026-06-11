/**
 * Layout for embedded plugin apps.
 * Removes the default dashboard page padding so the iframe can fill the full viewport height.
 */
export default function AppsLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-hidden">{children}</div>;
}
