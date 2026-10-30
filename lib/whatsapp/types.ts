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
  ready: boolean;
  webhookReady: boolean;
  webhookPath: string;
  canManage: boolean;
};
