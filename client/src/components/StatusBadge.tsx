import type { Status } from "../types";

const LABEL: Record<Status, string> = { dry: "Dry", normal: "Normal", wet: "Wet" };

export default function StatusBadge({ status }: { status: Status | null }) {
  if (!status) return <span className="badge badge-none">No data</span>;
  return <span className={`badge badge-${status}`}>{LABEL[status]}</span>;
}
