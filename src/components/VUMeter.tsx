"use client";

interface Props {
  level: number; // 0-1
}

export default function VUMeter({ level }: Props) {
  const segments = 12;
  const activeCount = Math.round(level * segments);

  return (
    <div className="flex gap-[2px] items-end h-8">
      {Array.from({ length: segments }, (_, i) => {
        const isActive = i < activeCount;
        let color = "bg-green-500";
        if (i >= segments - 2) color = "bg-red-500";
        else if (i >= segments - 4) color = "bg-yellow-400";

        return (
          <div
            key={i}
            className={`w-2 transition-opacity duration-75 rounded-[1px] ${
              isActive ? `${color} opacity-100` : "bg-green-900 opacity-30"
            }`}
            style={{ height: `${40 + i * 5}%` }}
          />
        );
      })}
    </div>
  );
}
