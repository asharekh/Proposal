export type ProposalType = 'technical' | 'financial' | 'combined';
export type ProposalStatus = 'won' | 'lost' | 'pending';
export type ReviewStatus = 'draft' | 'in_review' | 'approved' | 'exported';

export interface Tenant {
  id: string;
  name: string;
  name_en?: string | null;
  logo_url?: string | null;
  license_number?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  created_at: string;
}

export interface TenantProfile {
  tenant_id: string;
  writing_style?: string | null;
  fixed_terms: Record<string, any>;
  pricing_ranges: any[];
  specializations: string[];
  last_updated: string;
}

export interface Proposal {
  id: string;
  tenant_id: string;
  rfp_title: string;
  training_type?: string | null;
  sector?: string | null;
  content_text: string;
  status: ProposalStatus;
  embedding?: number[] | null;
  created_at: string;
}

export interface RFPInput {
  title: string; // اسم الدورة
  client_name: string; // اسم الشركة
  client_contact?: string | null; // اسم الشخص المسؤول
  budget?: number | null; // ميزانية التدريب
  category?: string | null; // الفئة
  subcategory?: string | null; // الفئة الفرعية
  training_type: string; // نوع التدريب
  certificate_type?: string | null; // نوع الشهادة
  preferred_language: string; // اللغة المفضلة
  trainees_count: number; // عدد المشاركين
  start_date?: string | null; // تاريخ البدء
  end_date?: string | null; // تاريخ الانتهاء
  other_requirements?: string | null; // متطلبات أخرى
  
  // Proposal generation settings
  proposal_type: ProposalType;
  deadline?: string | null;
  client_notes?: string | null;
  rfp_text?: string | null;
  duration_days?: number | null;
  delivery_mode?: string | null;
  client_sector?: string | null;
}

export interface Phase {
  number: number;
  title: string;
  description: string;
  duration: string;
  objectives: string[];
}

export interface TimelineItem {
  week: string;
  activity: string;
}

export interface FinancialBreakdownItem {
  item: string;
  quantity: number;
  unit_price: number | null;
  total: number | null;
}

export interface FinancialSection {
  breakdown: FinancialBreakdownItem[];
  total_before_vat: number | null;
  vat_amount: number | null;
  total_after_vat: number | null;
  payment_terms: string;
  validity_days: number;
}

export interface ProposalContent {
  executive_summary: string;
  about_institute: string;
  methodology: {
    approach: string;
    phases: Phase[];
    tools_and_resources: string[];
  };
  timeline: TimelineItem[];
  financial?: FinancialSection | null;
  terms_and_conditions: string;
}

export interface ComplianceItem {
  requirement: string;
  covered: boolean;
  note?: string | null;
}

export interface GeneratedProposal {
  id: string;
  tenant_id: string;
  rfp_data: RFPInput;
  draft_content: ProposalContent;
  review_status: ReviewStatus;
  compliance_score: number;
  compliance_checklist: ComplianceItem[];
  reference_proposal_ids: string[];
  reviewer_id?: string | null;
  reviewed_at?: string | null;
  exported_pdf_url?: string | null;
  created_at: string;
  judge_score?: number | null;
  judge_issues?: string[] | null;
}

export interface SimilarProposal {
  id: string;
  rfp_title: string;
  training_type?: string | null;
  sector?: string | null;
  content_text: string;
  status: ProposalStatus;
  similarity: number;
}
