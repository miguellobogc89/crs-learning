export type Account = {
  id: string;
  display_phone: string;
  verified_name: string | null;
  status: string;
};
export type Conversation = {
  id: string;
  contact_phone: string;
  contact_name: string | null;
  unread_count: number;
  last_message_at: string;
  last_inbound_at: string | null;
};
export type Message = {
  id: string;
  direction: string;
  kind: string;
  text: string;
  status: string;
  error: string | null;
  created_at: string;
};
export type Component = {
  type: string;
  text?: string;
  format?: string;
  buttons?: unknown[];
};
export type Template = {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: Component[];
  is_favorite: boolean;
};
export type Configuration = {
  appId: string;
  configId: string;
  version: string;
  checks?: {
    appId: boolean;
    appSecret: boolean;
    configId: boolean;
    encryptionKey: boolean;
    webhookVerifyToken: boolean;
  };
  missing?: string[];
  invalid?: string[];
  webhookMissing?: string[];
  ready: boolean;
  webhookReady: boolean;
  webhookPath: string;
  canManage: boolean;
};
export type ContactRow = {
  id: string;
  name: string;
  category: string | null;
  specialty: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
  email: string | null;
  rating: number | null;
  classification: string | null;
  stage: string;
  do_not_contact: boolean;
  consent: boolean;
  last_contacted_at: string | null;
  last_reply_at: string | null;
  conversation: {
    id: string;
    unread_count: number;
    last_message_at: string;
  } | null;
};
export type ContactDetail = ContactRow & {
  website: string | null;
  maps_url: string | null;
  consent_source: string | null;
  consent_at: string | null;
  notes: string | null;
  attributes: Record<string, string>;
  created_at: string;
};
export type Facet = { value: string | null; count: number };
export type ContactFacets = {
  facets: Record<string, Facet[]>;
  columns: string[];
};
export type CampaignSummary = {
  total: number;
  ready: number;
  withoutConsent: number;
  overLimit: number;
  limit: number;
  reasons: Record<string, number>;
  sample: { name: string; text: string } | null;
};
export type CampaignProgress = {
  counts: Record<string, number>;
  done: boolean;
  failures: { contact_id: string; error: string | null }[];
};
