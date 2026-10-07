export const ROLES = {
  cutting_supervisor: {
    label: 'Cutting Supervisor',
    can: ['Creates cutting orders and logs fabric', 'Submits batches to QC and resubmits after a re-cut'],
    cannot: ['Cannot count, approve or reject, and cannot open the sewing queue'],
    nav: [
      { label: 'Orders', note: 'your cutting orders and their progress' },
      { label: 'New order', note: 'create an order with a live piece-count preview' },
    ],
  },
  cutting_verifier: {
    label: 'Cutting Verifier',
    can: ['Counts every component piece by piece', 'Approves a clean batch or rejects it with a reason'],
    cannot: ['Cannot create orders or edit recipes, and cannot open the sewing queue'],
    nav: [{ label: 'Pending batches', note: 'the counting terminal with traffic-light cards' }],
  },
  sewing_supervisor: {
    label: 'Sewing Supervisor',
    can: ['Sees only verified batches in the queue', 'Reads verifier notes and starts assembly'],
    cannot: ['Cannot see pending or rejected orders in any way'],
    nav: [
      { label: 'Sewing queue', note: 'verified batches waiting for assembly' },
      { label: 'In assembly', note: 'batches where sewing has started' },
    ],
  },
};