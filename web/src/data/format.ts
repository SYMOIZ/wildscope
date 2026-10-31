const nf = new Intl.NumberFormat("en-US");

/** Content style §5: exact under 1,000,000; above that abbreviated with one decimal ("1.2 M"). */
export function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`;
  return nf.format(n);
}

export function fmtExact(n: number): string {
  return nf.format(n);
}

export function fmtShare(x: number): string {
  if (x === 0) return "0%";
  if (x < 0.001) return "<0.1%";
  return `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
}

export function fold(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function editDistanceAtMost1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
