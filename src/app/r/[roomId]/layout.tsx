// Static export needs at least one param to generate the route shell
export function generateStaticParams() {
  return [{ roomId: "_" }];
}

export default function RoomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
