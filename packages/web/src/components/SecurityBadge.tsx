interface Props {
  passed?: boolean;
  riskScore?: number;
  scanner?: string;
  label?: string;
}

const variants = {
  safe: 'bg-green-900/50 text-green-400 border-green-700/50',
  warning: 'bg-yellow-900/50 text-yellow-400 border-yellow-700/50',
  blocked: 'bg-red-900/50 text-red-400 border-red-700/50',
  pending: 'bg-gray-800 text-gray-400 border-gray-700',
};

export function SecurityBadge({ passed, riskScore, scanner, label }: Props) {
  let cls = variants.pending;
  let text = label ?? 'Pending';
  if (passed === true) {
    cls = variants.safe;
    text = label ?? 'Safe';
  } else if (passed === false) {
    cls = riskScore && riskScore >= 0.8 ? variants.blocked : variants.warning;
    text = label ?? 'Flagged';
  }
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {scanner ? `${scanner}: ` : ''}{text}
    </span>
  );
}
