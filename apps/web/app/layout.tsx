import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FleetGIS - Seguimiento de Flotas en Tiempo Real',
  description: 'Sistema GIS avanzado de gestión y monitorización de flotas con OpenLayers y WebSockets'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
