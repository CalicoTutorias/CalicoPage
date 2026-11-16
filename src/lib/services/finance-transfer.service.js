/**
 * Finance — the pieces every money-moving flow shares: the ledger settings,
 * account checks, proofs (comprobantes) and the validation of a transfer.
 *
 * Kept apart from finance-ledger.service so payouts / event services can
 * validate a transfer without importing the ledger (which reads payouts):
 * no import cycle.
 */

import * as repo from '../repositories/finance.repository';
import * as s3 from '../s3';
import { DEFAULT_GMF_RATE } from '../finance/ledger-math';
import { FINANCE_PROOF_TYPES, MAX_FINANCE_PROOF_SIZE, isFinanceProofKey } from '../finance/finance-proof';

export class FinanceError extends Error {
  constructor(message, code, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

export const invalid = (message, field, rule) => new FinanceError(message, 'VALIDATION_ERROR', { field, rule });


/**
 * Settings + accounts in the shape the projection needs.
 * `configured` is false until a cutoff date and the three default accounts exist.
 */
export async function loadConfig() {
  const [settings, accounts] = await Promise.all([repo.getSettings(), repo.listAccounts()]);
  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  const defaults = {
    wompi: settings?.wompiAccountId ?? null,
    bank: settings?.defaultBankAccountId ?? null,
    manual: settings?.defaultManualAccountId ?? null,
  };
  const configured = Boolean(settings?.cutoffDate && defaults.wompi && defaults.bank && defaults.manual);
  return {
    configured,
    cutoff: settings?.cutoffDate ? new Date(settings.cutoffDate) : null,
    gmfRate: settings?.gmfRate == null ? DEFAULT_GMF_RATE : Number(settings.gmfRate),
    accounts: defaults,
    accountsById,
    accountList: accounts,
  };
}

export async function assertAccount(id, field) {
  if (!id) throw invalid('Selecciona una cuenta', field, 'ACCOUNT_REQUIRED');
  const account = await repo.findAccount(id);
  if (!account) throw invalid('La cuenta no existe', field, 'ACCOUNT_NOT_FOUND');
  if (!account.isActive) throw invalid('La cuenta está inactiva', field, 'ACCOUNT_INACTIVE');
  return account;
}

/**
 * Check a proof key the browser says it uploaded and keep the object (the
 * lifecycle rule deletes what stays `unconfirmed`). Every transfer, refund
 * and manual entry that needs a proof goes through here.
 * @returns {Promise<string>} the key
 */
export async function confirmProof(s3Key, { field = 'proofS3Key' } = {}) {
  if (!isFinanceProofKey(s3Key)) throw invalid('Sube el comprobante', field, 'PROOF_REQUIRED');
  let head;
  try {
    head = await s3.headObject(s3Key);
  } catch (err) {
    if (err.code === 'NOT_FOUND') throw invalid('El comprobante no se subió', field, 'PROOF_NOT_UPLOADED');
    throw err;
  }
  if (!FINANCE_PROOF_TYPES[head.contentType]) throw invalid('Formato no permitido', field, 'PROOF_INVALID_TYPE');
  if (typeof head.contentLength === 'number' && head.contentLength > MAX_FINANCE_PROOF_SIZE) {
    throw invalid('El archivo supera 10 MB', field, 'PROOF_TOO_LARGE');
  }
  try {
    await s3.setObjectTags(s3Key, { status: 'confirmed' });
  } catch (err) {
    console.error(`[finance] Failed to confirm the tag of proof ${s3Key}: ${err.message}`);
  }
  return s3Key;
}

/**
 * Validate the money side of a transfer someone records outside this
 * service (a tutor payout, a refund): an active account, a date not in the
 * future and a confirmed proof. Before the cutoff date the transfer is
 * history (it never enters the ledger), so only its date is checked.
 * @returns {Promise<{ accountId: string, paidAt: Date, proofS3Key: string|null }>}
 */
export async function resolveTransfer({ accountId, paidAt, proofS3Key }, { now = new Date() } = {}) {
  let when = paidAt ? new Date(paidAt) : now;
  if (Number.isNaN(when.getTime())) throw invalid('Fecha inválida', 'paidAt', 'DATE_INVALID');
  // The forms send a day (stored at noon in Colombia): today's noon may still
  // be ahead, so a date within the next day is today, i.e. now.
  if (when > now) {
    if (when.getTime() - now.getTime() > 24 * 3_600_000) throw invalid('La fecha no puede ser futura', 'paidAt', 'DATE_IN_FUTURE');
    when = now;
  }

  const config = await loadConfig();
  const beforeCutoff = config.cutoff && when < config.cutoff;
  if (beforeCutoff) {
    // Already paid before the ledger existed: no account / proof needed.
    return { accountId: accountId ?? null, paidAt: when, proofS3Key: proofS3Key && isFinanceProofKey(proofS3Key) ? proofS3Key : null };
  }
  const account = await assertAccount(accountId ?? config.accounts.bank, 'accountId');
  const key = await confirmProof(proofS3Key);
  return { accountId: account.id, paidAt: when, proofS3Key: key };
}
