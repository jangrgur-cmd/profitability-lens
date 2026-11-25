// compare.js: peer comparison: the company on the form next to up to three
// others, all rated against the same industry benchmarks so the bands can be
// compared like for like.
//
// A peer is a name and one year of input values (taken from an example, an
// exported JSON file or a company kept from the form). Pure functions.

import { validateValues } from "./fields.js";
import { rate } from "./rating.js";
import { RATIOS } from "./ratios.js";

/** At most this many peers next to the company on the form. */
export const MAX_PEERS = 3;

/**
 * @typedef {object} Peer
 * @property {string} id unique within the list
 * @property {string} name
 * @property {"example"|"file"|"kept"} origin where it came from
 * @property {Record<string, number|null>} values one year of inputs
 */

/**
 * Rates the company and its peers on one industry scale and marks, for each
 * ratio, which column is highest (ties all count as highest).
 * Peers whose figures do not pass validation are returned with `rating: null`
 * and their errors, so the page can say why one cannot be shown.
 * @param {{name: string, values: object}} company the rated company on the form
 * @param {Peer[]} peers
 * @param {string} industryId
 * @returns {{columns: {name: string, peerId: string|null, rating: object|null, errors: string[]}[],
 *            best: Record<string, number[]>}} best: ratio id (and "score") → column indexes
 */
export function comparePeers(company, peers, industryId) {
  const columns = [
    { name: company.name, peerId: null, rating: rate(company.values, industryId), errors: [] },
    ...peers.slice(0, MAX_PEERS).map((peer) => {
      const errors = Object.values(validateValues(peer.values));
      return { name: peer.name, peerId: peer.id, rating: errors.length ? null : rate(peer.values, industryId), errors };
    }),
  ];
  const best = {};
  const mark = (key, valueOf) => {
    const values = columns.map((c) => (c.rating ? valueOf(c.rating) : null));
    const top = Math.max(...values.filter((v) => v !== null));
    best[key] = Number.isFinite(top) && values.filter((v) => v !== null).length > 1
      ? values.flatMap((v, i) => (v === top ? [i] : []))
      : [];
  };
  mark("score", (r) => r.score);
  for (const def of RATIOS) mark(def.id, (r) => r.ratios.find((x) => x.id === def.id).value);
  return { columns, best };
}

/**
 * Adds a peer unless the list is full. A peer with the same name and figures
 * as one already listed is not added twice.
 * @param {Peer[]} peers
 * @param {Omit<Peer, "id">} peer
 * @returns {{peers: Peer[], added: boolean, reason?: "full"|"duplicate"}}
 */
export function addPeer(peers, peer) {
  if (peers.length >= MAX_PEERS) return { peers, added: false, reason: "full" };
  const same = (p) => p.name === peer.name && JSON.stringify(p.values) === JSON.stringify(peer.values);
  if (peers.some(same)) return { peers, added: false, reason: "duplicate" };
  const used = new Set(peers.map((p) => p.id));
  let n = peers.length + 1;
  while (used.has(`p${n}`)) n += 1;
  return { peers: [...peers, { ...peer, id: `p${n}` }], added: true };
}
