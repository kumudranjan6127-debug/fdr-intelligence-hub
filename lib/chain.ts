// U2 — Renewal chain X-ray. Walk predecessorId links and check continuity of cover.
import { daysBetween } from "./format";

export type ChainNode = {
  id: string;
  code: string;
  type: string;
  status: string;
  predecessorId: string | null;
  amountPaise: bigint | null;
  issueDate: string | null;
  maturityDate: string | null;
  lienNoted: boolean | null;
};

export type ChainGap = { fromId: string; toId: string; from: string; to: string; days: number };
export type AmountDrop = { fromId: string; toId: string; fromPaise: bigint; toPaise: bigint };
export type LienBreak = { id: string; predecessorId: string | null };

export type ChainAnalysis = {
  nodes: ChainNode[];
  gaps: ChainGap[];
  overlaps: { fromId: string; toId: string; days: number }[];
  amountDrops: AmountDrop[];
  lienBreaks: LienBreak[];
  totalGapDays: number;
  lateRenewals: number;
  coverageStart: string | null;
  coverageEnd: string | null;
};

const TERMINAL = new Set(["REJECTED", "DRAFT"]);

/**
 * Order the chain containing `focusId`: root → … → focus → descendants.
 * Where a node has several successors (top-ups), the earliest-issued non-rejected one continues the line.
 */
export function buildChain(all: ChainNode[], focusId: string): ChainNode[] {
  const byId = new Map(all.map((n) => [n.id, n]));
  const focus = byId.get(focusId);
  if (!focus) return [];
  const up: ChainNode[] = [];
  const seen = new Set<string>();
  let cur: ChainNode | undefined = focus;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    up.unshift(cur);
    cur = cur.predecessorId ? byId.get(cur.predecessorId) : undefined;
  }
  const chain = [...up];
  let tail = focus;
  for (;;) {
    const next = all
      .filter((n) => n.predecessorId === tail.id && !TERMINAL.has(n.status) && !seen.has(n.id))
      .sort((a, b) => (a.issueDate ?? "").localeCompare(b.issueDate ?? ""))[0];
    if (!next) break;
    seen.add(next.id);
    chain.push(next);
    tail = next;
  }
  return chain;
}

export function analyzeChain(chain: ChainNode[]): ChainAnalysis {
  const gaps: ChainGap[] = [];
  const overlaps: ChainAnalysis["overlaps"] = [];
  const amountDrops: AmountDrop[] = [];
  const lienBreaks: LienBreak[] = [];

  chain.forEach((n, i) => {
    if (n.type === "FDR" && n.lienNoted === false) lienBreaks.push({ id: n.id, predecessorId: n.predecessorId });
    if (i === 0) return;
    const prev = chain[i - 1];
    if (prev.maturityDate && n.issueDate) {
      const d = daysBetween(prev.maturityDate, n.issueDate);
      if (d > 0) gaps.push({ fromId: prev.id, toId: n.id, from: prev.maturityDate, to: n.issueDate, days: d });
      else if (d < 0) overlaps.push({ fromId: prev.id, toId: n.id, days: -d });
    }
    if (prev.amountPaise !== null && n.amountPaise !== null && n.amountPaise < prev.amountPaise) {
      amountDrops.push({ fromId: prev.id, toId: n.id, fromPaise: prev.amountPaise, toPaise: n.amountPaise });
    }
  });

  return {
    nodes: chain,
    gaps,
    overlaps,
    amountDrops,
    lienBreaks,
    totalGapDays: gaps.reduce((s, g) => s + g.days, 0),
    lateRenewals: gaps.length,
    coverageStart: chain[0]?.issueDate ?? null,
    coverageEnd: chain[chain.length - 1]?.maturityDate ?? null,
  };
}

/** Group every instrument into chains (one per root). */
export function allChains(all: ChainNode[]): ChainNode[][] {
  const roots = all.filter((n) => !n.predecessorId || !all.some((m) => m.id === n.predecessorId));
  return roots.map((r) => buildChain(all, r.id));
}
