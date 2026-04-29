// Rendu de templates d'emails avec substitution {{var}}.
// Toute variable inconnue est laissée telle quelle pour que ça soit visible.

export interface TemplateFacture {
  numero_facture?: string | null;
  montant?: number | null;
  solde_restant?: number | null;
  date_echeance?: string | null;
}

export interface TemplateClient {
  nom?: string | null;
  code_client?: string | null;
  conditions_paiement?: string | null;
}

export interface TemplateContext {
  facture?: TemplateFacture | null;
  client?: TemplateClient | null;
}

const eurFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMontant(n: number | null | undefined): string {
  if (n == null) return '';
  return eurFormatter.format(Number(n));
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  // iso est attendu en YYYY-MM-DD
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function joursRetard(echeance: string | null | undefined): number {
  if (!echeance) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ech = new Date(echeance);
  if (Number.isNaN(ech.getTime())) return 0;
  ech.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - ech.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

export const TEMPLATE_VARIABLES: { name: string; description: string }[] = [
  { name: 'client_nom', description: 'Nom du client' },
  { name: 'client_code', description: 'Code client (FR_xxx / PT_xxx)' },
  { name: 'conditions_paiement', description: 'Conditions de paiement' },
  { name: 'facture_numero', description: 'Numéro de facture' },
  { name: 'facture_montant', description: 'Montant initial formaté' },
  { name: 'facture_solde', description: 'Solde restant formaté' },
  { name: 'facture_echeance', description: "Date d'échéance JJ/MM/AAAA" },
  { name: 'jours_retard', description: 'Jours de retard (entier)' },
  { name: 'date_jour', description: "Date du jour JJ/MM/AAAA" },
];

export function buildVariableMap(ctx: TemplateContext): Record<string, string> {
  const f = ctx.facture ?? {};
  const c = ctx.client ?? {};
  const today = new Date();
  return {
    client_nom: c.nom ?? '',
    client_code: c.code_client ?? '',
    conditions_paiement: c.conditions_paiement ?? 'comptant',
    facture_numero: f.numero_facture ?? '',
    facture_montant: formatMontant(f.montant ?? null),
    facture_solde: formatMontant(f.solde_restant ?? null),
    facture_echeance: formatDate(f.date_echeance ?? null),
    jours_retard: String(joursRetard(f.date_echeance ?? null)),
    date_jour: formatDate(today.toISOString().slice(0, 10)),
  };
}

export function renderTemplate(body: string, ctx: TemplateContext): string {
  const vars = buildVariableMap(ctx);
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, name: string) => {
    const key = name.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key];
    }
    return match;
  });
}
