"use client";

interface Props {
  text: string;
  variant?: "default" | "active" | "warning";
}

export default function StatusBar({ text, variant = "default" }: Props) {
  const colors = {
    default: "text-green-400/60",
    active: "text-green-400",
    warning: "text-yellow-400",
  };

  return (
    <div
      className={`px-3 py-1.5 text-xs tracking-wider uppercase ${colors[variant]}`}
      style={{ fontFamily: "var(--font-mono)" }}
    >
      {text}
    </div>
  );
}
