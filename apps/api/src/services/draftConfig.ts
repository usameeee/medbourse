import mongoose from 'mongoose';
import { AppError } from '../errors/AppError.js';
import type { CaseDocument, CaseRequiredDocumentFields } from '../models/Case.js';
import { Customer } from '../models/Customer.js';
import { DocumentRequirement } from '../models/DocumentRequirement.js';
import { Offering } from '../models/Offering.js';
import { PaymentEvidence } from '../models/PaymentEvidence.js';
import { Quotation } from '../models/Quotation.js';
import { resolvePaymentAccounts } from './paymentAccounts.js';
import { issueQuotation, resolvePricingRule } from './pricing.js';

/**
 * Freezes the offering's active document library entries onto the case checklist,
 * preserving the order the offering declared them in. The case keeps its own copy
 * so later library edits never change what an open case requires.
 */
export async function buildRequiredDocuments(offering: {
  requiredDocumentIds: mongoose.Types.ObjectId[];
}): Promise<CaseRequiredDocumentFields[]> {
  if (offering.requiredDocumentIds.length === 0) {
    return [];
  }
  const docs = await DocumentRequirement.find({
    _id: { $in: offering.requiredDocumentIds },
    isActive: true,
  }).exec();
  const byId = new Map(docs.map((doc) => [doc._id.toString(), doc]));
  const snapshot: CaseRequiredDocumentFields[] = [];
  for (const id of offering.requiredDocumentIds) {
    const doc = byId.get(id.toString());
    if (!doc) {
      continue;
    }
    snapshot.push({
      requirementId: doc._id,
      key: doc.key,
      title: {
        en: doc.title?.en ?? '',
        tr: doc.title?.tr ?? '',
        fr: doc.title?.fr ?? '',
        ar: doc.title?.ar ?? '',
      },
      description: doc.description
        ? {
            en: doc.description.en ?? '',
            tr: doc.description.tr ?? '',
            fr: doc.description.fr ?? '',
            ar: doc.description.ar ?? '',
          }
        : null,
      kind: doc.kind,
      order: snapshot.length,
    });
  }
  return snapshot;
}

/** A rule that cannot be resolved leaves the draft without a price rather than failing the read. */
function isUnpriceable(err: unknown): boolean {
  return (
    err instanceof AppError && (err.code === 'NO_PRICE' || err.code === 'AMBIGUOUS_PRICING')
  );
}

/**
 * Re-aligns an unfinished draft with the configuration it will be judged against, so the
 * office or the applicant always sees the team's *current* checklist, price, and receiving
 * rails — a service desk that adds a document, re-prices an offering, or opens a new account
 * while a file sits half-filled is instantly reflected (FU-T41).
 *
 * A submitted case is never touched: from the moment it is handed over, everything is frozen
 * onto the case so its snapshot, its quotation, and the review it went through stay exactly
 * as they were. Nor is a draft ever silently stripped: requirements only ever get *added* to
 * a half-filled checklist, because dropping one would hide a document that is already
 * uploaded. A draft that has already been paid into keeps its quotation — the receipt proves
 * the amount the customer paid — and is only re-quoted while nothing has been transferred.
 *
 * The sync deliberately writes no audit entry: it is a projection refresh driven by a read,
 * so its "actor" would be whoever happened to open the file, not whoever changed the config.
 */
export async function syncDraftCase(item: CaseDocument): Promise<CaseDocument> {
  if (item.submittedAt) {
    return item;
  }
  const offering = await Offering.findById(item.offeringId).exec();
  if (!offering) {
    return item;
  }
  let changed = false;

  // 1. The checklist gains every document the offering has been given since the draft opened.
  const wanted = await buildRequiredDocuments(offering);
  const present = new Set(item.requiredDocuments.map((req) => req.requirementId.toString()));
  for (const requirement of wanted) {
    if (present.has(requirement.requirementId.toString())) {
      continue;
    }
    item.requiredDocuments.push({ ...requirement, order: item.requiredDocuments.length });
    changed = true;
  }

  const customer = await Customer.findById(item.customerId, { countryCode: 1 }).exec();
  const countryCode = customer?.countryCode ?? null;

  // 2. The price follows the pricing rules until the file is handed over.
  let quotation = item.quotationId ? await Quotation.findById(item.quotationId).exec() : null;
  if (countryCode) {
    let ruleId: string | null = null;
    try {
      const rule = await resolvePricingRule({
        countryCode,
        category: offering.category,
        offeringId: offering._id.toString(),
      });
      ruleId = rule._id.toString();
    } catch (err) {
      if (!isUnpriceable(err)) {
        throw err;
      }
    }
    const current = quotation?.pricingRuleId?.toString() === ruleId;
    if (ruleId !== null && !current) {
      const paid = quotation
        ? (await PaymentEvidence.countDocuments({ quotationId: quotation._id })) > 0
        : false;
      if (!paid) {
        quotation = await issueQuotation({
          customerId: item.customerId.toString(),
          offeringId: item.offeringId.toString(),
          actorUserId: item.createdByUserId.toString(),
          countryCode,
        });
        item.quotationId = quotation._id;
        // The old rail may not serve the new currency, so let the default be picked again.
        item.paymentAccountId = null;
        changed = true;
      }
    }
  }

  // 3. The rail is re-resolved while none is chosen, or once the chosen one no longer serves
  //    the quoted currency and the customer's country (deactivated, or edited away) — the
  //    resolver only ever returns rails that still match.
  if (quotation && countryCode) {
    const accounts = await resolvePaymentAccounts({ countryCode, currency: quotation.currency });
    const chosen = accounts.find(
      (account) => account._id.toString() === item.paymentAccountId?.toString(),
    );
    const best = chosen ?? accounts[0];
    if (best && best._id.toString() !== item.paymentAccountId?.toString()) {
      item.paymentAccountId = best._id;
      item.paymentMethod = best.method;
      changed = true;
    }
  }

  if (changed) {
    await item.save();
  }
  return item;
}
