import { full, isShort, short } from "./number";
import { Tooltip } from "./Tooltip";

/** A number shown short from 10,000 up, with the whole number on hover. */
export function Short({
  value,
  money,
  className,
}: {
  value: number;
  money?: boolean;
  className?: string;
}) {
  const text = short(value, money);
  if (!isShort(value))
    return className ? <span className={className}>{text}</span> : <>{text}</>;
  // A data element, not a span, so no stylesheet rule for spans inside a cell restyles the number.
  return (
    <Tooltip tip={full(value, money)}>
      <data
        value={Math.round(value)}
        className={className ? `tt-num ${className}` : "tt-num"}
      >
        {text}
      </data>
    </Tooltip>
  );
}
