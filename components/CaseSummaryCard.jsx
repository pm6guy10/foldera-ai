"use client";

export default function CaseSummaryCard({ title, value }) {
  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-cyan-300 mb-2">{title}</h3>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
