import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import {
  DOCUMENT_KINDS,
  type DocumentKind,
  type LocalizedText,
  type PublicDocumentRequirement,
} from '@medbourse/shared';

export interface DocumentRequirementFields {
  key: string;
  title: LocalizedText;
  description: LocalizedText | null;
  kind: DocumentKind;
  order: number;
  isActive: boolean;
}

export type DocumentRequirementDocument = HydratedDocument<DocumentRequirementFields>;

/** Localized sub-document matching the pattern used by Offering and SiteContent. */
const localizedSchema = (maxlength: number) =>
  new mongoose.Schema<LocalizedText>(
    {
      en: { type: String, default: '', trim: true, maxlength },
      tr: { type: String, default: '', trim: true, maxlength },
      fr: { type: String, default: '', trim: true, maxlength },
      ar: { type: String, default: '', trim: true, maxlength },
    },
    { _id: false },
  );

const emptyLocalized = () => ({ en: '', tr: '', fr: '', ar: '' });

const documentRequirementSchema = new mongoose.Schema<DocumentRequirementFields>(
  {
    key: { type: String, required: true, lowercase: true, trim: true, maxlength: 60 },
    title: { type: localizedSchema(160), default: emptyLocalized },
    description: { type: localizedSchema(800), default: null },
    kind: { type: String, required: true, enum: DOCUMENT_KINDS },
    order: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

documentRequirementSchema.index({ key: 1 }, { unique: true });
documentRequirementSchema.index({ order: 1, key: 1 });

function normalizeLocalized(value: LocalizedText | null | undefined): LocalizedText {
  return {
    en: value?.en ?? '',
    tr: value?.tr ?? '',
    fr: value?.fr ?? '',
    ar: value?.ar ?? '',
  };
}

export function toPublicDocumentRequirement(
  doc: DocumentRequirementDocument,
): PublicDocumentRequirement {
  return {
    id: doc._id.toString(),
    key: doc.key,
    title: normalizeLocalized(doc.title),
    description: doc.description ? normalizeLocalized(doc.description) : null,
    kind: doc.kind,
    order: doc.order,
    isActive: doc.isActive,
  };
}

export const DocumentRequirement: Model<DocumentRequirementFields> =
  mongoose.models.DocumentRequirement ??
  mongoose.model<DocumentRequirementFields>('DocumentRequirement', documentRequirementSchema);
