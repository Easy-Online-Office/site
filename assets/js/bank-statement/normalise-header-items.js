const TERMS = Object.freeze(["date", "reference", "description", "fees", "debits", "credits", "amount", "balance", "bank"]);

export function normaliseHeaderItems(rows) {
  return rows.map((row) => ({
    ...row,
    items: row.items.flatMap((item) => {
      const value = String(item.text || "").trim().toLowerCase();
      const term = TERMS.find((candidate) => value === candidate || value.startsWith(`${candidate} `) || value.startsWith(`${candidate}(`));
      if (!term || value === term) return [item];
      return [item, { ...item, text: term.charAt(0).toUpperCase() + term.slice(1) }];
    })
  }));
}
